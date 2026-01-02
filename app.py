import base64
import copy
import json
import os
import shutil
import uuid
from datetime import datetime
from io import BytesIO
from pathlib import Path
from threading import Lock

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory
from PIL import Image

from plugins import get_face_swap_plugin
from test_gen_api import generate_via_image_fallback

load_dotenv()

IMGBB_API_KEY = os.getenv("IMGBB_API_KEY")
SESSION_KEY = os.getenv("SESSION_KEY")


# 配置
HISTORY_DIR = Path("history")
HISTORY_DIR.mkdir(exist_ok=True)

# 避免重复提交（简单任务锁）
current_task_lock = Lock()
is_generating = False

# 保存输入图片
INPUT_IMAGES_DIR = HISTORY_DIR / "inputs"
INPUT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)


# 保存生成结果
RESULTS_DIR = HISTORY_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)


app = Flask(__name__)
app.secret_key = SESSION_KEY  # 用于 session 安全


def save_image_from_url(url: str, folder: Path) -> str:
    """从 URL 下载图片，保存到 folder，返回本地相对路径（如 'results/abc.jpg'）"""
    try:
        resp = requests.get(url, stream=True, timeout=30)
        if resp.status_code != 200:
            raise Exception(f"HTTP {resp.status_code}")

        # 推测文件扩展名
        ext = ".jpg"  # 默认用 jpg
        content_type = resp.headers.get("content-type", "")
        if "png" in content_type:
            ext = ".png"
        elif "webp" in content_type:
            ext = ".webp"

        filename = str(uuid.uuid4()) + ext
        filepath = folder / filename

        with open(filepath, "wb") as f:
            resp.raw.decode_content = True
            shutil.copyfileobj(resp.raw, f)

        # 强制转为 JPG（统一格式）
        if ext != ".jpg":
            from PIL import Image

            img = Image.open(filepath).convert("RGB")
            jpg_path = filepath.with_suffix(".jpg")
            img.save(jpg_path, "JPEG", quality=92)
            filepath.unlink()  # 删除原文件
            filepath = jpg_path

        return str(filepath.relative_to(Path(".")))  # 如 "history/inputs/xxx.jpg"
    except Exception as e:
        print(f"[Save Image Error] {url} -> {e}")
        return None


def save_uploaded_file_as_jpg(file_storage, folder: Path) -> str:
    """将 Flask 上传的 file 保存为 JPG（PNG 自动转）"""
    try:
        filename = str(uuid.uuid4()) + ".jpg"
        temp_path = folder / filename

        # 若是 PNG，用 PIL 转 JPG（带白底）
        if file_storage.filename.lower().endswith(".png"):
            from PIL import Image

            img = Image.open(file_storage.stream).convert("RGBA")
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            background.save(temp_path, "JPEG", quality=92)
        else:
            # 直接保存为 JPG（即使原为 JPG/JPEG）
            from PIL import Image

            img = Image.open(file_storage.stream).convert("RGB")
            img.save(temp_path, "JPEG", quality=92)

        return str(temp_path.relative_to(Path(".")))
    except Exception as e:
        print(f"[Save Uploaded File Error] {e}")
        return None


@app.route("/history/<path:filename>")
def history_files(filename):
    return send_from_directory(HISTORY_DIR, filename)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload-images", methods=["POST"])
def upload_images():
    """上传图片到 ImgBB（供 API 使用），同时保存 JPG 副本到本地（供历史记录）"""
    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "No images provided"}), 400

    imgbb_urls = []
    local_paths = []

    for file in files[:10]:
        if not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue

        # 步骤 1: 上传到 ImgBB
        # 修复 URL 末尾空格问题！
        imgbb_resp = requests.post(
            "https://api.imgbb.com/1/upload",  # ← 删除末尾空格
            data={"key": IMGBB_API_KEY},
            files={"image": file},
        )
        if imgbb_resp.status_code != 200:
            print(f"[ImgBB] Upload failed: {imgbb_resp.text}")
            continue

        imgbb_url = imgbb_resp.json()["data"]["url"]
        imgbb_urls.append(imgbb_url)

        # 步骤 2: 保存本地 JPG 副本（从原始 file 重新读，因为 file.stream 可能已耗尽）
        # 重置 stream 指针
        file.stream.seek(0)
        local_path = save_uploaded_file_as_jpg(file, INPUT_IMAGES_DIR)
        if local_path:
            local_paths.append("/" + local_path.replace("\\", "/"))

    return jsonify(
        {
            "urls": imgbb_urls,  # 给后端 API 用（外网可访问）
            "local_paths": local_paths,  # 给前端预览用（本地路径）
        }
    )


@app.route("/generate", methods=["POST"])
def generate():
    global is_generating
    if current_task_lock.locked():
        return jsonify({"error": "Another task is running. Please wait."}), 429

    with current_task_lock:
        data = request.get_json()
        image_urls = data.get("image_urls", [])  # ← 这是 ImgBB URLs，正确！
        prompt = data.get("prompt", "").strip()
        size = data.get("size", "2K")
        aspect_ratio = data.get("aspect_ratio", "auto")

        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400

        try:
            result_urls = generate_via_image_fallback(
                image_urls=image_urls,
                prompt=prompt,
                size=size,
                ar=aspect_ratio,
                fallback_order=["nano_banana", "rh_official"],
            )
        except Exception as e:
            return jsonify({"error": f"Generation failed: {str(e)}"}), 500

        if not result_urls:
            return jsonify({"error": "All APIs failed to generate image"}), 500

        # ✅ 保存结果图到本地（从 result_urls 下载）
        local_result_paths = []
        for url in result_urls:
            local_path = save_image_from_url(url, RESULTS_DIR)
            if local_path:
                local_result_paths.append("/" + local_path.replace("\\", "/"))

        if not local_result_paths:
            return jsonify({"error": "Failed to save result images locally"}), 500

        # ✅ 获取对应的本地输入图路径（用于历史记录展示）
        # 假设前端传的 image_urls 顺序和本地保存一致 —— 但更可靠的方式是前端传 local_paths？
        # 简化方案：我们从历史中匹配（不完美），或让前端同时传 local_input_paths
        # → 更好的做法：前端在 generate 时同时传 local_input_paths

        # 为简化，我们暂不保存输入图本地路径到 record（或从已有文件推断）
        # 实际上，你可以通过 image_urls 的文件名反推，但略复杂
        # 建议：前端在 /generate 时额外传 `local_input_paths`

        local_input_paths = data.get("local_input_paths", [])

        record_id = str(uuid.uuid4())
        record = {
            "id": record_id,
            "timestamp": datetime.now().isoformat(),
            "image_urls": image_urls,  # 外部 URL（用于调试）
            "local_input_paths": local_input_paths,
            "result_urls": result_urls,  # 外部 URL
            "local_result_paths": local_result_paths,  # 本地路径
            "prompt": prompt,
            "size": size,
            "aspect_ratio": aspect_ratio,
        }

        record_path = HISTORY_DIR / f"{record_id}.json"
        with open(record_path, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)

        # 返回本地路径给前端展示
        return jsonify(
            {
                "success": True,
                "result_urls": local_result_paths,  # 前端用本地路径显示
                "record_id": record_id,
            }
        )


@app.route("/history")
def get_history():
    """分页获取历史记录（JSON 文件列表）"""
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 12))
    if page < 1:
        page = 1

    # 获取所有 JSON 文件，按时间倒序
    history_files = sorted(
        HISTORY_DIR.glob("*.json"), key=os.path.getmtime, reverse=True
    )

    total = len(history_files)
    start = (page - 1) * limit
    end = start + limit
    page_files = history_files[start:end]

    records = []
    for f in page_files:
        try:
            with open(f, "r", encoding="utf-8") as fp:
                record = json.load(fp)
                # 只返回必要字段给前端
                records.append(
                    {
                        "id": record["id"],
                        "timestamp": record["timestamp"],
                        "result_paths": record.get("local_result_paths", []),
                        "result_urls": record.get("result_urls", []),
                        "input_paths": record.get("local_input_paths", []),
                        "input_urls": record.get("image_urls", []),
                        "params": {
                            "size": record["size"],
                            "aspect_ratio": record["aspect_ratio"],
                            "prompt": record["prompt"],
                        },
                    }
                )
        except Exception as e:
            print(f"[History] Load error: {f} - {e}")
            continue

    return jsonify(
        {
            "records": records,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit,
        }
    )


@app.route("/quick-upload", methods=["POST"])
def quick_upload():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file"}), 400
    local_path = save_uploaded_file_as_jpg(file, INPUT_IMAGES_DIR)
    if not local_path:
        return jsonify({"error": "Save failed"}), 500

    # 上传到 ImgBB
    with open(local_path, "rb") as f:
        imgbb_resp = requests.post(
            "https://api.imgbb.com/1/upload",
            data={"key": IMGBB_API_KEY},
            files={"image": f},
        )
    if imgbb_resp.status_code != 200:
        return jsonify({"error": "ImgBB failed"}), 500
    return jsonify(
        {
            "url": imgbb_resp.json()["data"]["url"],
            "local_path": "/" + local_path.replace("\\", "/"),
        }
    )


@app.route("/save-cropped-images", methods=["POST"])
def save_cropped_images():
    """接收 Base64 图片列表，保存到 history/results/，返回本地路径"""
    data = request.get_json()
    base64_images = data.get("images", [])  # list of "data:image/jpeg;base64,..."

    if not base64_images:
        return jsonify({"error": "No images provided"}), 400

    saved_paths = []
    for b64_str in base64_images:
        try:
            # 去掉 data URL 前缀（如果有）
            if b64_str.startswith("data:image"):
                header, b64_str = b64_str.split(",", 1)

            # 解码 Base64
            image_data = base64.b64decode(b64_str)
            image = Image.open(BytesIO(image_data)).convert("RGB")

            # 生成唯一文件名
            filename = f"{uuid.uuid4().hex}.jpg"
            filepath = RESULTS_DIR / filename
            image.save(filepath, "JPEG", quality=92)

            # 返回相对于项目根目录的路径（前端可直接 /history/results/... 访问）
            rel_path = f"/{filepath.relative_to(Path('.')).as_posix()}"
            saved_paths.append(rel_path)
        except Exception as e:
            print(f"[Save Cropped Image Error] {e}")
            continue

    return jsonify({"success": True, "local_paths": saved_paths})


@app.route("/history-record", methods=["POST"])
def save_manual_history():
    data = request.get_json()
    i = 1
    for local_result_path in data.get("local_result_paths", []):
        record_data = copy.deepcopy(data)
        record_data["local_result_paths"] = [local_result_path]
        record_id = data.get("id", str(uuid.uuid4()))
        record_path = HISTORY_DIR / f"{record_id}_{i}.json"
        with open(record_path, "w", encoding="utf-8") as f:
            json.dump(record_data, f, ensure_ascii=False, indent=2)
        i += 1
    return jsonify({"success": True})


@app.route("/history/<record_id>", methods=["DELETE"])
def delete_history_record(record_id):
    """删除指定历史记录（JSON + 本地图片）"""
    try:
        # 1. 找到 JSON 文件
        json_path = None
        for f in HISTORY_DIR.glob("*.json"):
            if f.stem.startswith(record_id):
                json_path = f
                break

        if not json_path:
            return jsonify({"error": "Record not found"}), 404

        # 2. 读取记录，获取所有本地图片路径
        with open(json_path, "r", encoding="utf-8") as fp:
            record = json.load(fp)

        all_local_paths = []
        all_local_paths.extend(record.get("local_result_paths", []))

        # 3. 删除 JSON 文件
        json_path.unlink()

        # 4. 删除关联的本地图片
        for rel_path in all_local_paths:
            if rel_path.startswith("/"):
                rel_path = rel_path[1:]
            full_path = Path(rel_path)
            if full_path.exists():
                full_path.unlink()

        return jsonify({"success": True})
    except Exception as e:
        print(f"[Delete Error] {e}")
        return jsonify({"error": "Delete failed"}), 500


@app.route("/swap_face", methods=["POST"])
def swap_face():
    """
    使用 generate_via_image_fallback 实现换脸：图1为被替换图像，图2为人脸源图像。
    """
    global is_generating
    if current_task_lock.locked():
        return jsonify({"error": "Another task is running. Please wait."}), 429

    with current_task_lock:
        try:
            data = request.get_json()
            source_url = data.get("source_url", "").strip()  # 图1：被换脸的图
            face_url = data.get("face_url", "").strip()  # 图2：提供人脸的图

            if not source_url or not face_url:
                return jsonify({"error": "Missing source_url or face_url"}), 400

            # 构造输入图片顺序：[图1, 图2]
            image_urls = [source_url, face_url]

            # 精炼提示词：明确指令 + 保持其他不变
            prompt = "我需要执行一个换脸任务，target image是图1，face image是图2"

            # 使用现有生成逻辑（auto 长宽比，2K 尺寸）
            result_urls = generate_via_image_fallback(
                image_urls=image_urls,
                prompt=prompt,
                size="2K",
                ar="auto",
                fallback_order=["nano_banana", "rh_official"],
            )

            if not result_urls:
                return jsonify(
                    {"error": "All APIs failed to generate swapped image"}
                ), 500

            # 保存结果到本地
            local_result_paths = []
            for url in result_urls:
                local_path = save_image_from_url(url, RESULTS_DIR)
                if local_path:
                    local_result_paths.append("/" + local_path.replace("\\", "/"))

            if not local_result_paths:
                return jsonify({"error": "Failed to save result images locally"}), 500

            # 返回第一个结果（通常只有一个）
            return jsonify(
                {
                    "success": True,
                    "result_url": result_urls[0],  # 原始外部 URL
                    "local_path": local_result_paths[0],  # 本地路径供前端显示
                }
            )

        except Exception as e:
            print(f"[Swap Face Error] {e}")
            return jsonify({"error": f"换脸失败: {str(e)}"}), 500


@app.route("/dummy_swap_face", methods=["POST"])
def dummy_swap_face():
    """
    伪换脸接口：接收 source_url 和 face_url，返回一个占位结果图
    """
    try:
        data = request.get_json()
        source_url = data.get("source_url")
        face_url = data.get("face_url")

        if not source_url or not face_url:
            return jsonify({"error": "Missing source_url or face_url"}), 400

        # ✅ 伪逻辑：返回一个固定占位图（可替换为真实换脸）
        result_url = "https://placehold.co/1280x800?text=FACE"

        # （可选）未来替换为真实换脸：
        # result_url = real_face_swap(source_url, face_url)

        return jsonify({"success": True, "result_url": result_url})

    except Exception as e:
        print(f"[Swap Face Error] {e}")
        return jsonify({"error": "换脸失败"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
