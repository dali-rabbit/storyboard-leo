import base64
import copy
import json
import os
import shutil
import tempfile
import threading
import uuid
from datetime import datetime
from io import BytesIO
from pathlib import Path
from threading import Lock

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory
from PIL import Image

from film_manager import (
    create_film, delete_film, get_film, list_films, update_film,
    get_film_history_dir, get_film_storyboards_dir, get_film_quick_access_path,
    load_quick_access, save_quick_access, add_quick_access_image,
    update_quick_access_image, remove_quick_access_image,
    init_default_film, migrate_existing_data, DEFAULT_FILM_ID
)
from plugin_settings import (
    load_plugin_settings, save_plugin_settings, 
    get_enabled_plugins, AVAILABLE_PLUGINS, DEFAULT_PLUGINS
)
from plugins import get_face_swap_plugin
from test_gen_api import generate_via_image_fallback
from uploader import UploadError, upload_file

# 缓存锁（避免并发写冲突）
cache_lock = threading.Lock()


def get_cache_file(film_id=None):
    """获取缓存文件路径"""
    if film_id:
        return f"films/{film_id}/upload.cache"
    return "history/upload.cache"  # 默认缓存文件（兼容旧版）

load_dotenv()

IMGBB_API_KEY = os.getenv("IMGBB_API_KEY")
SESSION_KEY = os.getenv("SESSION_KEY")


# 避免重复提交（简单任务锁）
current_task_lock = Lock()
is_generating = False


app = Flask(__name__)
app.secret_key = SESSION_KEY  # 用于 session 安全


# ========== 初始化影片系统 ==========
def init_film_system():
    """初始化影片系统，迁移现有数据"""
    created, has_data = init_default_film()
    if created and has_data:
        print("[Film] 检测到现有数据，正在迁移到默认影片...")
        result = migrate_existing_data()
        print(f"[Film] 迁移完成: {result}")
    elif created:
        print("[Film] 已创建默认影片")


init_film_system()


# ========== 辅助函数：获取影片目录 ==========
def get_film_dirs(film_id):
    """获取影片的各目录路径"""
    history_dir = get_film_history_dir(film_id)
    return {
        "history": history_dir,
        "inputs": history_dir / "inputs",
        "results": history_dir / "results",
        "storyboards": get_film_storyboards_dir(film_id),
    }


def save_image_from_url(url: str, folder: Path) -> str:
    """从 URL 下载图片或解析 base64 data URI，保存到 folder，返回本地相对路径"""
    from PIL import Image
    
    try:
        # 处理 base64 data URI
        if url.startswith("data:image"):
            # 解析 data URI: data:image/png;base64,xxxxx
            header, b64_data = url.split(",", 1)
            
            # 推测文件类型
            ext = ".jpg"  # 默认 jpg
            if "png" in header:
                ext = ".png"
            elif "webp" in header:
                ext = ".webp"
            
            # 解码 base64
            image_data = base64.b64decode(b64_data)
            
            filename = str(uuid.uuid4()) + ext
            filepath = folder / filename
            
            with open(filepath, "wb") as f:
                f.write(image_data)
            
            # 统一转为 JPG
            if ext != ".jpg":
                img = Image.open(filepath).convert("RGB")
                jpg_path = filepath.with_suffix(".jpg")
                img.save(jpg_path, "JPEG", quality=92)
                filepath.unlink()
                filepath = jpg_path
            
            return str(filepath.relative_to(Path(".")))
        
        # 处理普通 URL
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
    """支持影片隔离的历史文件访问"""
    # 从文件名中提取影片 ID（路径格式: films/{film_id}/history/...）
    if filename.startswith("films/"):
        # 解析路径 films/{film_id}/history/inputs/xxx.jpg
        # 或 films/{film_id}/history/results/xxx.jpg
        parts = filename.split("/")
        if len(parts) >= 4 and parts[2] == "history":
            film_id = parts[1]
            # 剩余路径如 inputs/xxx.jpg 或 results/xxx.jpg
            sub_path = "/".join(parts[3:])
            film_dir = get_film_history_dir(film_id)
            full_path = film_dir / sub_path
            if full_path.exists():
                return send_from_directory(film_dir, sub_path)
    
    # 兼容旧格式 - 使用默认影片
    film_dir = get_film_history_dir(DEFAULT_FILM_ID)
    full_path = film_dir / filename
    if full_path.exists():
        return send_from_directory(film_dir, filename)
    
    return "File not found", 404


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload-images", methods=["POST"])
def upload_images():
    files = request.files.getlist("images")
    film_id = request.form.get("film_id", DEFAULT_FILM_ID)
    
    if not files:
        return jsonify({"error": "No images provided"}), 400

    # 获取影片目录
    dirs = get_film_dirs(film_id)
    dirs["inputs"].mkdir(parents=True, exist_ok=True)

    external_urls = []
    local_paths = []

    for file in files[:10]:
        if not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue

        # 1. 保存本地 JPG 副本（用于历史记录）
        file.stream.seek(0)
        local_path = save_uploaded_file_as_jpg(file, dirs["inputs"])
        if not local_path:
            continue
        # 返回 /history/ 开头的路径，与访问路由匹配
        local_paths.append("/history/" + local_path.replace("\\", "/"))

        # 2. 上传到外部服务（ImgBB 或 GitHub+jsDelivr）
        try:
            # 临时保存文件用于上传
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp_path = tmp.name
                with open(local_path, "rb") as src:
                    tmp.write(src.read())
            # 上传
            external_url = upload_file(tmp_path, file.filename)
            external_urls.append(external_url)
        except Exception as e:
            error_msg = str(e)
            print(f"[Upload External Error] {error_msg}")
            # 保存最后一个错误，用于返回给前端
            upload_error = error_msg
            external_urls.append(None)
        finally:
            if "tmp_path" in locals():
                Path(tmp_path).unlink(missing_ok=True)

    # 过滤掉上传失败的
    valid_records = [
        (url, local) for url, local in zip(external_urls, local_paths) if url
    ]
    if not valid_records:
        error_detail = locals().get('upload_error', 'Unknown error')
        return jsonify({"error": f"All uploads failed: {error_detail}"}), 500

    external_urls, local_paths = zip(*valid_records)
    return jsonify({"urls": list(external_urls), "local_paths": list(local_paths)})


@app.route("/generate", methods=["POST"])
def generate():
    global is_generating
    if current_task_lock.locked():
        return jsonify({"error": "Another task is running. Please wait."}), 429

    with current_task_lock:
        data = request.get_json()
        image_urls = data.get("image_urls", [])  # ← 这是 ImgBB URLs，正确！
        prompt = (data.get("prompt") or "").strip()
        size = data.get("size", "2K")
        aspect_ratio = data.get("aspect_ratio", "auto")
        film_id = data.get("film_id", DEFAULT_FILM_ID)

        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400

        try:
            # 获取用户配置的插件设置
            plugin_settings = load_plugin_settings(film_id)
            fallback_order = [s["name"] for s in plugin_settings if s.get("enabled", False)]
            
            if not fallback_order:
                # 如果没有启用的插件，使用默认
                fallback_order = [p["name"] for p in DEFAULT_PLUGINS]
            
            # 构建模型配置
            plugin_models = {}
            for setting in plugin_settings:
                if setting.get("model"):
                    plugin_models[setting["name"]] = setting["model"]
            
            print(f"[Generate] 使用插件顺序: {fallback_order}")
            print(f"[Generate] 插件模型配置: {plugin_models}")
            
            gen_result = generate_via_image_fallback(
                image_urls=image_urls,
                prompt=prompt,
                size=size,
                ar=aspect_ratio,
                fallback_order=fallback_order,
                plugin_models=plugin_models,
            )
        except Exception as e:
            return jsonify({"error": f"Generation failed: {str(e)}"}), 500

        if not gen_result:
            return jsonify({"error": "All APIs failed to generate image"}), 500

        # 提取生成结果和耗时
        result_urls = gen_result["urls"] if isinstance(gen_result, dict) else gen_result
        gen_elapsed = gen_result.get("elapsed", 0) if isinstance(gen_result, dict) else 0
        gen_plugin = gen_result.get("plugin", "") if isinstance(gen_result, dict) else ""

        # ✅ 获取影片目录
        dirs = get_film_dirs(film_id)
        dirs["results"].mkdir(parents=True, exist_ok=True)

        # ✅ 保存结果图到本地（从 result_urls 下载）
        local_result_paths = []
        for url in result_urls:
            local_path = save_image_from_url(url, dirs["results"])
            if local_path:
                local_result_paths.append("/history/" + local_path.replace("\\", "/"))

        if not local_result_paths:
            return jsonify({"error": "Failed to save result images locally"}), 500

        local_input_paths = data.get("local_input_paths", [])

        record_id = str(uuid.uuid4())
        record = {
            "id": record_id,
            "film_id": film_id,  # 关联影片
            "timestamp": datetime.now().isoformat(),
            "image_urls": image_urls,  # 外部 URL（用于调试）
            "local_input_paths": local_input_paths,
            "result_urls": result_urls,  # 外部 URL
            "local_result_paths": local_result_paths,  # 本地路径
            "prompt": prompt,
            "size": size,
            "aspect_ratio": aspect_ratio,
            "gen_elapsed": gen_elapsed,  # 生成耗时（秒）
            "gen_plugin": gen_plugin,  # 使用的插件
        }

        record_path = dirs["history"] / f"{record_id}.json"
        with open(record_path, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)

        # 返回本地路径给前端展示
        return jsonify(
            {
                "success": True,
                "result_urls": local_result_paths,  # 前端用本地路径显示
                "record_id": record_id,
                "elapsed": gen_elapsed,  # 生成耗时（秒，仅包含 API 调用时间）
                "plugin": gen_plugin,  # 使用的插件
            }
        )


@app.route("/history")
def get_history():
    """分页获取历史记录（JSON 文件列表，按影片隔离）"""
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 12))
    film_id = request.args.get("film_id", DEFAULT_FILM_ID)
    
    if page < 1:
        page = 1

    # 获取影片历史目录
    dirs = get_film_dirs(film_id)
    history_dir = dirs["history"]

    # 获取所有 JSON 文件，按时间倒序
    history_files = sorted(
        history_dir.glob("*.json"), key=os.path.getmtime, reverse=True
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
    film_id = request.form.get("film_id", DEFAULT_FILM_ID)
    
    if not file or not file.filename:
        return jsonify({"error": "No file"}), 400

    dirs = get_film_dirs(film_id)
    dirs["inputs"].mkdir(parents=True, exist_ok=True)
    
    local_path = save_uploaded_file_as_jpg(file, dirs["inputs"])
    if not local_path:
        return jsonify({"error": "Save failed"}), 500

    try:
        external_url = upload_file(local_path, file.filename)
        return jsonify(
            {
                "url": external_url,
                "local_path": "/history/" + local_path.replace("\\", "/"),
            }
        )
    except Exception as e:
        print(f"[Quick Upload Error] {e}")
        return jsonify({"error": "External upload failed"}), 500


def load_cache(cache_file="history/upload.cache"):
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Cache Load Error] {e}")
            return {}
    return {}


def save_cache(cache, cache_file="history/upload.cache"):
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(cache_file), exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Cache Save Error] {e}")


@app.route("/quick-upload-2", methods=["POST"])
def quick_upload_2():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    # 安全处理路径
    local_path = data.get("local_path", "")
    film_id = data.get("film_id", DEFAULT_FILM_ID)
    
    if not local_path or not isinstance(local_path, str):
        return jsonify({"error": "Invalid local_path"}), 400

    print(f"[quick-upload-2] 原始路径: {local_path}, 影片: {film_id}")

    # 移除开头的 /history/ 前缀（前端路径格式为 /history/films/...）
    # 实际文件路径是 films/...
    if local_path.startswith("/history/"):
        local_path = local_path[9:]  # 去掉 "/history/"
    elif local_path.startswith("/"):
        local_path = local_path[1:]  # 只去掉开头的 /

    # 标准化路径（防止 ../ 等）
    local_path = os.path.normpath(local_path)
    if local_path.startswith("..") or os.path.isabs(local_path):
        return jsonify({"error": "Invalid path"}), 400

    full_local_path = os.path.join(os.getcwd(), local_path)
    print(f"[quick-upload-2] 查找文件: {full_local_path}")
    
    if not os.path.exists(full_local_path):
        print(f"[quick-upload-2] 文件不存在: {full_local_path}")
        return jsonify({"error": "File not found"}), 404

    # 获取影片缓存文件
    cache_file = get_cache_file(film_id)
    
    # 读取缓存
    with cache_lock:
        cache = load_cache(cache_file)
        if local_path in cache:
            # 命中缓存，直接返回
            print(f"[quick-upload-2] 缓存命中")
            return jsonify(
                {
                    "url": cache[local_path],
                    "local_path": "/history/" + local_path.replace("\\", "/"),
                    "cached": True,
                }
            )

        # 未命中，执行上传
        try:
            print(f"[quick-upload-2] 缓存未命中，开始上传")
            external_url = upload_file(
                full_local_path, os.path.basename(full_local_path)
            )
            # 写入缓存
            cache[local_path] = external_url
            save_cache(cache, cache_file)
            print(f"[quick-upload-2] 上传成功，已缓存")
            return jsonify(
                {
                    "url": external_url,
                    "local_path": "/history/" + local_path.replace("\\", "/"),
                    "cached": False,
                }
            )
        except Exception as e:
            print(f"[Quick Upload Error] {e}")
            return jsonify({"error": "External upload failed"}), 500


@app.route("/save-cropped-images", methods=["POST"])
def save_cropped_images():
    """接收 Base64 图片列表，保存到影片的 results/，返回本地路径"""
    data = request.get_json()
    base64_images = data.get("images", [])  # list of "data:image/jpeg;base64,..."
    film_id = data.get("film_id", DEFAULT_FILM_ID)

    if not base64_images:
        return jsonify({"error": "No images provided"}), 400

    # 获取影片目录
    dirs = get_film_dirs(film_id)
    dirs["results"].mkdir(parents=True, exist_ok=True)

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
            filepath = dirs["results"] / filename
            image.save(filepath, "JPEG", quality=92)

            # 返回 /history/ 开头的路径，与访问路由匹配
            rel_path = f"/history/{filepath.relative_to(Path('.')).as_posix()}"
            saved_paths.append(rel_path)
        except Exception as e:
            print(f"[Save Cropped Image Error] {e}")
            continue

    return jsonify({"success": True, "local_paths": saved_paths})


@app.route("/history-record", methods=["POST"])
def save_manual_history():
    data = request.get_json()
    film_id = data.get("film_id", DEFAULT_FILM_ID)
    
    dirs = get_film_dirs(film_id)
    
    i = 1
    for local_result_path in data.get("local_result_paths", []):
        record_data = copy.deepcopy(data)
        record_data["local_result_paths"] = [local_result_path]
        record_id = data.get("id", str(uuid.uuid4()))
        record_path = dirs["history"] / f"{record_id}_{i}.json"
        with open(record_path, "w", encoding="utf-8") as f:
            json.dump(record_data, f, ensure_ascii=False, indent=2)
        i += 1
    return jsonify({"success": True})


@app.route("/history/<record_id>", methods=["DELETE"])
def delete_history_record(record_id):
    """删除指定历史记录（JSON + 本地图片）"""
    try:
        film_id = request.args.get("film_id", DEFAULT_FILM_ID)
        dirs = get_film_dirs(film_id)
        
        # 1. 找到 JSON 文件
        json_path = None
        for f in dirs["history"].glob("*.json"):
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


@app.route("/history/batch-delete", methods=["POST"])
def batch_delete_history():
    """批量删除历史记录（JSON + 本地图片）"""
    try:
        data = request.get_json()
        record_ids = data.get("record_ids", [])
        film_id = data.get("film_id", DEFAULT_FILM_ID)
        
        if not record_ids:
            return jsonify({"error": "No record IDs provided"}), 400
        
        dirs = get_film_dirs(film_id)
        deleted_count = 0
        failed_ids = []
        
        for record_id in record_ids:
            try:
                # 1. 找到 JSON 文件
                json_path = None
                for f in dirs["history"].glob("*.json"):
                    if f.stem.startswith(record_id):
                        json_path = f
                        break
                
                if not json_path:
                    failed_ids.append(record_id)
                    continue
                
                # 2. 读取记录，获取所有本地图片路径
                with open(json_path, "r", encoding="utf-8") as fp:
                    record = json.load(fp)
                
                all_local_paths = record.get("local_result_paths", [])
                
                # 3. 删除 JSON 文件
                json_path.unlink()
                
                # 4. 删除关联的本地图片
                for rel_path in all_local_paths:
                    if rel_path.startswith("/"):
                        rel_path = rel_path[1:]
                    full_path = Path(rel_path)
                    if full_path.exists():
                        full_path.unlink()
                        print(f"[Batch Delete] 删除图片: {full_path}")
                
                deleted_count += 1
                
            except Exception as e:
                print(f"[Batch Delete] 删除 {record_id} 失败: {e}")
                failed_ids.append(record_id)
        
        return jsonify({
            "success": True,
            "deleted_count": deleted_count,
            "failed_ids": failed_ids
        })
    except Exception as e:
        print(f"[Batch Delete Error] {e}")
        return jsonify({"error": "Batch delete failed"}), 500


# @app.route("/swap_face", methods=["POST"])
# def swap_face():
#     """
#     使用 generate_via_image_fallback 实现换脸：图1为被替换图像，图2为人脸源图像。
#     """
#     global is_generating
#     if current_task_lock.locked():
#         return jsonify({"error": "Another task is running. Please wait."}), 429

#     with current_task_lock:
#         try:
#             data = request.get_json()
#             source_url = data.get("source_url", "").strip()  # 图1：被换脸的图
#             face_url = (data.get("face_url") or "").strip()  # 图2：提供人脸的图

#             if not source_url or not face_url:
#                 return jsonify({"error": "Missing source_url or face_url"}), 400

#             # 构造输入图片顺序：[图1, 图2]
#             image_urls = [source_url, face_url]

#             # 精炼提示词：明确指令 + 保持其他不变
#             prompt = "我需要执行一个换脸任务，target image是图1，face image是图2"

#             # 使用现有生成逻辑（auto 长宽比，2K 尺寸）
#             result_urls = generate_via_image_fallback(
#                 image_urls=image_urls,
#                 prompt=prompt,
#                 size="2K",
#                 ar="auto",
#                 fallback_order=["nano_banana", "rh_official"],
#             )

#             if not result_urls:
#                 return jsonify(
#                     {"error": "All APIs failed to generate swapped image"}
#                 ), 500

#             # 保存结果到本地
#             local_result_paths = []
#             for url in result_urls:
#                 local_path = save_image_from_url(url, RESULTS_DIR)
#                 if local_path:
#                     local_result_paths.append("/" + local_path.replace("\\", "/"))

#             if not local_result_paths:
#                 return jsonify({"error": "Failed to save result images locally"}), 500

#             # 返回第一个结果（通常只有一个）
#             return jsonify(
#                 {
#                     "success": True,
#                     "result_url": result_urls[0],  # 原始外部 URL
#                     "local_path": local_result_paths[0],  # 本地路径供前端显示
#                 }
#             )

#         except Exception as e:
#             print(f"[Swap Face Error] {e}")
#             return jsonify({"error": f"换脸失败: {str(e)}"}), 500


# ========== 影片管理 API ==========

@app.route("/api/films", methods=["GET"])
def api_list_films():
    """列出所有影片"""
    return jsonify(list_films())


@app.route("/api/films", methods=["POST"])
def api_create_film():
    """创建新影片"""
    data = request.get_json()
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "影片名称不能为空"}), 400
    
    description = data.get("description", "").strip()
    film = create_film(name, description)
    return jsonify(film)


@app.route("/api/films/<film_id>", methods=["GET"])
def api_get_film(film_id):
    """获取影片详情"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    return jsonify(film)


@app.route("/api/films/<film_id>", methods=["PUT"])
def api_update_film(film_id):
    """更新影片信息"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    
    data = request.get_json()
    name = data.get("name")
    description = data.get("description")
    cover_image = data.get("cover_image")
    
    updated = update_film(film_id, name, description, cover_image)
    return jsonify(updated)


@app.route("/api/films/<film_id>", methods=["DELETE"])
def api_delete_film(film_id):
    """删除影片"""
    success, error = delete_film(film_id)
    if not success:
        return jsonify({"error": error}), 400 if "不能删除" in error else 404
    return jsonify({"success": True})


# ========== 插件设置 API ==========

@app.route("/api/films/<film_id>/plugin-settings", methods=["GET"])
def api_get_plugin_settings(film_id):
    """获取影片的插件设置"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    
    settings = load_plugin_settings(film_id)
    return jsonify({
        "settings": settings,
        "available_plugins": AVAILABLE_PLUGINS
    })


@app.route("/api/films/<film_id>/plugin-settings", methods=["PUT"])
def api_update_plugin_settings(film_id):
    """更新影片的插件设置"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    
    data = request.get_json()
    settings = data.get("settings", [])
    
    # 验证设置格式
    if not isinstance(settings, list):
        return jsonify({"error": "Invalid settings format"}), 400
    
    # 过滤无效插件
    valid_settings = [
        s for s in settings 
        if s.get("name") in AVAILABLE_PLUGINS
    ]
    
    if not valid_settings:
        return jsonify({"error": "No valid plugins"}), 400
    
    if save_plugin_settings(film_id, valid_settings):
        return jsonify({"success": True, "settings": valid_settings})
    else:
        return jsonify({"error": "Failed to save settings"}), 500


@app.route("/api/films/<film_id>/enabled-plugins", methods=["GET"])
def api_get_enabled_plugins(film_id):
    """获取启用的插件列表（用于生成）"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    
    enabled = get_enabled_plugins(film_id)
    return jsonify({"plugins": enabled})


# ========== 快捷访问 API（按影片隔离） ==========

@app.route("/api/films/<film_id>/quick-access", methods=["GET"])
def api_get_quick_access(film_id):
    """获取影片的快捷访问数据"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    return jsonify(load_quick_access(film_id))


@app.route("/api/films/<film_id>/quick-access", methods=["POST"])
def api_add_quick_access(film_id):
    """添加图片到快捷访问"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    
    data = request.get_json()
    image_data = {
        "localPath": data.get("localPath"),
        "remoteUrl": data.get("remoteUrl"),
        "category": data.get("category"),
        "group": data.get("group"),
        "viewType": data.get("viewType"),
        "note": data.get("note"),
    }
    
    result = add_quick_access_image(film_id, image_data)
    if result is None:
        return jsonify({"error": "图片已存在"}), 409
    return jsonify(result)


@app.route("/api/films/<film_id>/quick-access/<path:local_path>", methods=["PUT"])
def api_update_quick_access(film_id, local_path):
    """更新快捷访问图片信息"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    
    # 补回前导斜杠（Flask path 会吃掉）
    full_local_path = "/" + local_path if not local_path.startswith("/") else local_path
    
    data = request.get_json()
    result = update_quick_access_image(film_id, full_local_path, data)
    if not result:
        return jsonify({"error": "图片不存在"}), 404
    return jsonify(result)


@app.route("/api/films/<film_id>/quick-access/<path:local_path>", methods=["DELETE"])
def api_delete_quick_access(film_id, local_path):
    """从快捷访问中移除图片"""
    film = get_film(film_id)
    if not film:
        return jsonify({"error": "影片不存在"}), 404
    
    # 补回前导斜杠（Flask path 会吃掉）
    full_local_path = "/" + local_path if not local_path.startswith("/") else local_path
    
    print(f"[QuickAccess Delete] film_id={film_id}, local_path={full_local_path}")
    
    remove_quick_access_image(film_id, full_local_path)
    return jsonify({"success": True})


@app.route("/swap_face", methods=["POST"])
def swap_face():
    """
    调用配置的换脸插件（如 replicate_swap），执行真实换脸。
    """
    try:
        data = request.get_json()
        source_url = data.get("source_url", "").strip()
        face_url = data.get("face_url", "").strip()
        film_id = data.get("film_id", DEFAULT_FILM_ID)

        if not source_url or not face_url:
            return jsonify({"error": "Missing source_url or face_url"}), 400

        # 获取换脸插件函数
        swap_func = get_face_swap_plugin()
        if swap_func is None:
            return jsonify(
                {"error": "Face swap plugin not configured or unavailable"}
            ), 500

        # 调用插件执行换脸
        result_url = swap_func(source_image_url=source_url, face_image_url=face_url)

        # 保存结果到本地（按影片隔离）
        dirs = get_film_dirs(film_id)
        local_path = save_image_from_url(result_url, dirs["results"])
        if not local_path:
            return jsonify({"error": "Failed to save swapped image locally"}), 500

        return jsonify(
            {
                "success": True,
                "result_url": result_url,  # 外部 URL（调试用）
                "local_path": "/history/" + local_path.replace("\\", "/"),  # 前端展示用
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


@app.route("/save-storyboard", methods=["POST"])
def save_storyboard():
    data = request.json
    if "panels" not in data:
        return jsonify({"success": False, "error": "无效数据"})

    film_id = data.get("film_id", DEFAULT_FILM_ID)
    dirs = get_film_dirs(film_id)
    
    title = ""
    if "title" in data:
        title = data["title"]
    record_id = None
    if "id" in data:
        record_id = data["id"]

    # 验证 panels 结构
    for panel in data["panels"]:
        if not isinstance(panel.get("images"), list):
            return jsonify({"success": False, "error": "images 必须是数组"})
        for url in panel["images"]:
            if not isinstance(url, str) or not url.strip():
                return jsonify({"success": False, "error": "图片引用必须是有效字符串"})

    # 如不存在输入id，则为新record生成唯一 ID
    if not record_id:
        record_id = (
            f"sb_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}"
        )

    record = {
        "title": title,
        "id": record_id,
        "film_id": film_id,  # 关联影片
        "type": "storyboard",
        "timestamp": datetime.utcnow().isoformat(),
        "panels": data["panels"],  # 仅保存引用路径
    }

    # 保存为单个 JSON 文件
    filepath = dirs["storyboards"] / f"{record_id}.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)

    return jsonify({"success": True, "record_id": record_id})


@app.route("/list-storyboards", methods=["GET"])
def list_storyboards():
    film_id = request.args.get("film_id", DEFAULT_FILM_ID)
    dirs = get_film_dirs(film_id)
    
    files = []
    for f in os.listdir(dirs["storyboards"]):
        if f.endswith(".json"):
            with open(os.path.join(dirs["storyboards"], f), "r", encoding="utf-8") as fp:
                try:
                    data = json.load(fp)
                    files.append(
                        {
                            "id": data.get("id"),
                            "title": data.get("title", "未命名故事板"),
                            "timestamp": data.get("timestamp"),
                        }
                    )
                except:
                    continue
    # 按时间倒序
    files.sort(key=lambda x: x["timestamp"], reverse=True)
    return jsonify(files)


@app.route("/load-storyboard/<id>", methods=["GET"])
def load_storyboard(id):
    film_id = request.args.get("film_id", DEFAULT_FILM_ID)
    dirs = get_film_dirs(film_id)
    
    filepath = dirs["storyboards"] / f"{id}.json"
    if not filepath.exists():
        return jsonify({"error": "Not found"}), 404
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return jsonify(data)


@app.route("/delete-storyboard/<id>", methods=["DELETE"])
def delete_storyboard(id):
    """删除指定 ID 的故事板（JSON 文件）"""
    film_id = request.args.get("film_id", DEFAULT_FILM_ID)
    dirs = get_film_dirs(film_id)
    
    if not id or not isinstance(id, str):
        return jsonify({"success": False, "error": "Invalid ID"}), 400

    filepath = dirs["storyboards"] / f"{id}.json"
    if not filepath.exists():
        return jsonify({"success": False, "error": "Story board not found"}), 404

    try:
        os.remove(filepath)
        return jsonify({"success": True})
    except Exception as e:
        print(f"[Delete Storyboard Error] {e}")
        return jsonify({"success": False, "error": "Failed to delete"}), 500


@app.route("/region_edit", methods=["POST"])
def region_edit():
    """
    区域编辑API：对图片的指定区域进行编辑（换脸或图生图），并将结果覆盖回原图
    
    请求参数:
    - original_url: 原始图片URL
    - region: {x, y, width, height, aspect_ratio} 选区信息（归一化坐标0-1）
    - edit_type: "face_swap" 或 "img2img"
    - face_url: 换脸模式下的参考面部URL
    - prompt: 图生图模式下的提示词
    - extra_image_urls: 图生图模式下的额外参考图URL列表（可选）
    - film_id: 影片ID
    """
    try:
        data = request.get_json()
        original_url = (data.get("original_url") or "").strip()
        region = data.get("region", {})
        edit_type = (data.get("edit_type") or "").strip()
        film_id = data.get("film_id", DEFAULT_FILM_ID)
        
        if not original_url:
            return jsonify({"error": "Missing original_url"}), 400
        
        if not region:
            return jsonify({"error": "Missing region data"}), 400
        
        # 获取选区参数
        rx = region.get("x", 0)
        ry = region.get("y", 0)
        rw = region.get("width", 1)
        rh = region.get("height", 1)
        aspect_ratio = region.get("aspect_ratio", "1:1")
        
        # 辅助函数：加载图片（支持多种格式）
        def load_image_for_region(url, name="image"):
            """支持 data URL、HTTP URL、/history/ 路径、本地路径"""
            if url.startswith("data:image"):
                header, encoded = url.split(",", 1)
                image_data = base64.b64decode(encoded)
                return Image.open(BytesIO(image_data)).convert("RGB")
            elif url.startswith("http://") or url.startswith("https://"):
                resp = requests.get(url, timeout=30)
                resp.raise_for_status()
                return Image.open(BytesIO(resp.content)).convert("RGB")
            elif url.startswith("/history/") or url.startswith("history/"):
                # URL 格式: /history/films/xxx/history/results/yyy.jpg
                # 实际路径: films/xxx/history/results/yyy.jpg (去掉 /history/ 前缀)
                if url.startswith("/history/"):
                    local_path = url[9:]  # 去掉 '/history/' 前缀 (9个字符)
                else:
                    local_path = url[8:]  # 去掉 'history/' 前缀 (8个字符)
                abs_path = os.path.join(os.getcwd(), local_path)
                print(f"[Load Image] Converted URL to path: {abs_path}")
                if os.path.exists(abs_path):
                    return Image.open(abs_path).convert("RGB")
                raise FileNotFoundError(f"Local file not found: {abs_path}")
            elif os.path.exists(url):
                return Image.open(url).convert("RGB")
            else:
                raise ValueError(f"Unsupported {name} source: {url[:50]}...")
        
        # 加载原始图片
        try:
            original_image = load_image_for_region(original_url, "original")
        except Exception as e:
            print(f"[Region Edit] 加载原始图片失败: {e}")
            return jsonify({"error": f"Failed to load original image: {str(e)}"}), 500
        
        orig_w, orig_h = original_image.size
        
        # 计算选区的像素坐标
        crop_x = int(rx * orig_w)
        crop_y = int(ry * orig_h)
        crop_w = int(rw * orig_w)
        crop_h = int(rh * orig_h)
        
        # 确保选区不超出边界
        crop_x = max(0, min(crop_x, orig_w - 1))
        crop_y = max(0, min(crop_y, orig_h - 1))
        crop_w = min(crop_w, orig_w - crop_x)
        crop_h = min(crop_h, orig_h - crop_y)
        
        # 裁剪选区
        cropped = original_image.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))
        print(f"[Region Edit] 选区尺寸: {cropped.size}, 原图尺寸: {original_image.size}")
        print(f"[Region Edit] 选区坐标: ({crop_x}, {crop_y}, {crop_x + crop_w}, {crop_y + crop_h})")
        
        # 将裁剪后的图片保存到临时文件并上传
        dirs = get_film_dirs(film_id)
        dirs["inputs"].mkdir(parents=True, exist_ok=True)
        
        temp_crop_path = dirs["inputs"] / f"region_crop_{uuid.uuid4().hex}.jpg"
        cropped.save(temp_crop_path, "JPEG", quality=95)
        print(f"[Region Edit] 选区已保存: {temp_crop_path}")
        
        # 上传裁剪后的图片
        try:
            cropped_url = upload_file(str(temp_crop_path), temp_crop_path.name)
            print(f"[Region Edit] 选区已上传: {cropped_url[:80]}...")
        except Exception as e:
            print(f"[Region Edit] 上传裁剪图片失败: {e}")
            temp_crop_path.unlink(missing_ok=True)
            return jsonify({"error": "Failed to upload cropped image"}), 500
        
        # 执行编辑
        if edit_type == "face_swap":
            face_url = (data.get("face_url") or "").strip()
            if not face_url:
                temp_crop_path.unlink(missing_ok=True)
                return jsonify({"error": "Missing face_url"}), 400
            
            # 获取换脸插件
            swap_func = get_face_swap_plugin()
            if swap_func is None:
                temp_crop_path.unlink(missing_ok=True)
                return jsonify({"error": "Face swap plugin not available"}), 500
            
            try:
                # 调用换脸API
                print(f"[Region Edit] 调用换脸: source={cropped_url[:80]}..., face={face_url[:80]}...")
                result_url = swap_func(source_image_url=cropped_url, face_image_url=face_url)
                print(f"[Region Edit] 换脸结果: {result_url[:80]}...")
            except Exception as e:
                print(f"[Region Edit] 换脸失败: {e}")
                temp_crop_path.unlink(missing_ok=True)
                return jsonify({"error": f"Face swap failed: {str(e)}"}), 500
                
        elif edit_type == "img2img":
            prompt = (data.get("prompt") or "").strip()
            if not prompt:
                temp_crop_path.unlink(missing_ok=True)
                return jsonify({"error": "Missing prompt"}), 400
            
            extra_urls = data.get("extra_image_urls", [])
            
            # 构建图片列表：选区图片 + 额外图片
            image_urls = [cropped_url] + extra_urls
            
            # 获取插件设置
            try:
                plugin_settings = load_plugin_settings(film_id)
                fallback_order = [s["name"] for s in plugin_settings if s.get("enabled", False)]
                if not fallback_order:
                    fallback_order = [p["name"] for p in DEFAULT_PLUGINS]
                
                plugin_models = {}
                for setting in plugin_settings:
                    if setting.get("model"):
                        plugin_models[setting["name"]] = setting["model"]
            except Exception as e:
                print(f"[Region Edit] 加载插件设置失败: {e}")
                fallback_order = [p["name"] for p in DEFAULT_PLUGINS]
                plugin_models = {}
            
            # 调用图生图API
            try:
                gen_result = generate_via_image_fallback(
                    image_urls=image_urls,
                    prompt=prompt,
                    size="auto",  # 使用auto让API根据输入图片决定
                    ar=aspect_ratio,  # 使用选区的长宽比
                    fallback_order=fallback_order,
                    plugin_models=plugin_models,
                )
                
                if not gen_result:
                    temp_crop_path.unlink(missing_ok=True)
                    return jsonify({"error": "Image generation failed"}), 500
                
                result_url = gen_result["urls"][0] if isinstance(gen_result, dict) else gen_result[0]
                
            except Exception as e:
                print(f"[Region Edit] 图生图失败: {e}")
                temp_crop_path.unlink(missing_ok=True)
                return jsonify({"error": f"Image generation failed: {str(e)}"}), 500
        else:
            temp_crop_path.unlink(missing_ok=True)
            return jsonify({"error": "Invalid edit_type"}), 400
        
        # 下载编辑结果
        try:
            result_resp = requests.get(result_url, timeout=60)
            result_resp.raise_for_status()
            result_image = Image.open(BytesIO(result_resp.content)).convert("RGB")
        except Exception as e:
            print(f"[Region Edit] 下载编辑结果失败: {e}")
            temp_crop_path.unlink(missing_ok=True)
            return jsonify({"error": "Failed to download edited image"}), 500
        
        # 清理临时文件
        temp_crop_path.unlink(missing_ok=True)
        
        # 强制调整结果图片尺寸以匹配选区（如果不同）
        print(f"[Region Edit] 编辑结果尺寸: {result_image.size}, 选区尺寸: ({crop_w}, {crop_h})")
        if result_image.size != (crop_w, crop_h):
            result_image = result_image.resize((crop_w, crop_h), Image.LANCZOS)
            print(f"[Region Edit] 已调整尺寸为: ({crop_w}, {crop_h})")
        
        # ✅ 保存选区小图（不是合成大图）用于前端预览
        dirs["results"].mkdir(parents=True, exist_ok=True)
        result_filename = f"region_edit_{uuid.uuid4().hex}.jpg"
        result_path = dirs["results"] / result_filename
        result_image.save(result_path, "JPEG", quality=95)
        
        # 计算相对路径
        rel_path = str(result_path.relative_to(Path(".")))
        
        print(f"[Region Edit] 选区编辑结果已保存: {result_path} ({crop_w}x{crop_h})")
        
        return jsonify({
            "success": True,
            "local_path": "/history/" + rel_path.replace("\\", "/"),
            "width": crop_w,
            "height": crop_h,
        })
        
    except Exception as e:
        print(f"[Region Edit Error] {e}")
        return jsonify({"error": f"Region edit failed: {str(e)}"}), 500


@app.route("/color-match", methods=["POST"])
def color_match():
    """
    颜色匹配API：将目标图片的色调匹配到参考图片的色调
    
    请求参数:
    - target_url: 目标图片URL（需要调整色调的图片，编辑结果）
    - ref_url: 参考图片URL（原图）
    - region: 可选，从原图中提取指定区域作为参考 {x, y, width, height} 归一化坐标0-1
    - method: 颜色匹配方法，可选 'mkl', 'hm', 'reinhard', 'mvgd', 'hm-mvgd-hm', 'hm-mkl-hm'，默认 'mkl'
    - strength: 匹配强度，0.0-1.0，默认 1.0
    - film_id: 影片ID
    
    返回:
    - local_path: 处理后的图片本地路径
    """
    try:
        data = request.get_json()
        target_url = (data.get("target_url") or "").strip()
        ref_url = (data.get("ref_url") or "").strip()
        region = data.get("region")  # 可选的选区参数
        method = data.get("method", "mkl")
        strength = float(data.get("strength", 1.0))
        film_id = data.get("film_id", DEFAULT_FILM_ID)
        
        if not target_url or not ref_url:
            return jsonify({"error": "Missing target_url or ref_url"}), 400
        
        # 验证 method 参数
        valid_methods = ['mkl', 'hm', 'reinhard', 'mvgd', 'hm-mvgd-hm', 'hm-mkl-hm']
        if method not in valid_methods:
            method = 'mkl'
        
        # 限制 strength 范围
        strength = max(0.0, min(1.0, strength))
        
        # 辅助函数：解析各种 URL 格式为 PIL Image
        def load_image_from_url(url, name="image"):
            """支持 data URL、HTTP URL、/history/ 路径、本地路径"""
            if url.startswith("data:image"):
                header, encoded = url.split(",", 1)
                image_data = base64.b64decode(encoded)
                return Image.open(BytesIO(image_data)).convert("RGB")
            elif url.startswith("http://") or url.startswith("https://"):
                resp = requests.get(url, timeout=30)
                resp.raise_for_status()
                return Image.open(BytesIO(resp.content)).convert("RGB")
            elif url.startswith("/history/") or url.startswith("history/"):
                if url.startswith("/history/"):
                    local_path = url[9:]
                else:
                    local_path = url[8:]
                abs_path = os.path.join(os.getcwd(), local_path)
                if os.path.exists(abs_path):
                    return Image.open(abs_path).convert("RGB")
                raise FileNotFoundError(f"Local file not found: {abs_path}")
            elif os.path.exists(url):
                return Image.open(url).convert("RGB")
            else:
                raise ValueError(f"Unsupported {name} source: {url[:50]}...")
        
        # 加载目标图片
        try:
            target_image = load_image_from_url(target_url, "target")
            print(f"[Color Match] 目标图片加载成功: {target_image.size}")
        except Exception as e:
            print(f"[Color Match] 加载目标图片失败: {e}")
            return jsonify({"error": f"Failed to load target image: {str(e)}"}), 500
        
        # 加载参考图片
        try:
            ref_image = load_image_from_url(ref_url, "reference")
            print(f"[Color Match] 参考图片加载成功: {ref_image.size}")
        except Exception as e:
            print(f"[Color Match] 加载参考图片失败: {e}")
            return jsonify({"error": f"Failed to load reference image: {str(e)}"}), 500
        
        # 如果提供了选区参数，从原图中提取对应区域作为参考
        if region and all(k in region for k in ['x', 'y', 'width', 'height']):
            ref_w, ref_h = ref_image.size
            # 计算像素坐标
            crop_x = int(region['x'] * ref_w)
            crop_y = int(region['y'] * ref_h)
            crop_w = int(region['width'] * ref_w)
            crop_h = int(region['height'] * ref_h)
            
            # 确保边界有效
            crop_x = max(0, min(crop_x, ref_w - 1))
            crop_y = max(0, min(crop_y, ref_h - 1))
            crop_w = min(crop_w, ref_w - crop_x)
            crop_h = min(crop_h, ref_h - crop_y)
            
            # 裁剪出选区作为参考
            ref_image = ref_image.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))
            print(f"[Color Match] 从原图提取选区作为参考: ({crop_x}, {crop_y}, {crop_w}, {crop_h})")
        
        # 调整参考图片尺寸以匹配目标图片
        if ref_image.size != target_image.size:
            ref_image = ref_image.resize(target_image.size, Image.LANCZOS)
        
        # 使用 color-matcher 进行颜色匹配
        try:
            from color_matcher import ColorMatcher
            import numpy as np
            
            # 转换为 numpy 数组 (H, W, C) 格式，值范围 0-255
            target_np = np.array(target_image).astype(np.float32)
            ref_np = np.array(ref_image).astype(np.float32)
            
            # 创建 ColorMatcher 实例
            cm = ColorMatcher()
            
            # 执行颜色匹配
            print(f"[Color Match] 使用 {method} 方法进行颜色匹配，strength={strength}")
            result_np = cm.transfer(src=target_np, ref=ref_np, method=method)
            
            # 应用强度混合
            if strength < 1.0:
                result_np = target_np + strength * (result_np - target_np)
            
            # 裁剪到有效范围
            result_np = np.clip(result_np, 0, 255).astype(np.uint8)
            
            # 转回 PIL Image
            result_image = Image.fromarray(result_np)
            
        except ImportError:
            print("[Color Match] color-matcher 库未安装，使用简单直方图匹配")
            # 降级方案：使用 Pillow 的简单直方图匹配
            result_image = simple_histogram_match(target_image, ref_image, strength)
        except Exception as e:
            print(f"[Color Match] 颜色匹配失败: {e}")
            return jsonify({"error": f"Color matching failed: {str(e)}"}), 500
        
        # 保存结果
        dirs = get_film_dirs(film_id)
        dirs["results"].mkdir(parents=True, exist_ok=True)
        result_filename = f"color_match_{uuid.uuid4().hex}.jpg"
        result_path = dirs["results"] / result_filename
        result_image.save(result_path, "JPEG", quality=95)
        
        rel_path = str(result_path.relative_to(Path(".")))
        
        print(f"[Color Match] 处理完成: {result_path}")
        return jsonify({
            "success": True,
            "local_path": "/history/" + rel_path.replace("\\", "/"),
        })
        
    except Exception as e:
        print(f"[Color Match Error] {e}")
        return jsonify({"error": f"Color match failed: {str(e)}"}), 500


@app.route("/seamless-clone", methods=["POST"])
def seamless_clone():
    """
    无缝融合API：将选区小图无缝融合到原图指定位置
    
    请求参数:
    - source_url: 选区小图URL（编辑后的结果）
    - target_url: 原图URL（要融合到的背景）
    - x, y: 选区在原图中的位置（像素坐标）
    - method: 融合方法，可选 'none' | 'feather' | 'poisson_normal' | 'poisson_mixed'
    - feather_radius: 羽化半径（仅当 method='feather' 时有效），默认 10
    - film_id: 影片ID
    
    返回:
    - local_path: 融合后的完整图片路径
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return jsonify({"error": "OpenCV not installed, run: pip install opencv-python"}), 500
    
    try:
        data = request.get_json()
        source_url = (data.get("source_url") or "").strip()
        target_url = (data.get("target_url") or "").strip()
        x = int(data.get("x", 0))
        y = int(data.get("y", 0))
        method = data.get("method", "none")
        feather_radius = int(data.get("feather_radius", 10))
        film_id = data.get("film_id", DEFAULT_FILM_ID)
        
        if not source_url or not target_url:
            return jsonify({"error": "Missing source_url or target_url"}), 400
        
        # 验证 method 参数
        valid_methods = ['none', 'feather', 'poisson_normal', 'poisson_mixed']
        if method not in valid_methods:
            method = 'none'
        
        # 如果不需要融合，直接返回原图
        if method == 'none':
            return jsonify({
                "success": True,
                "local_path": target_url,
                "method": "none"
            })
        
        # 辅助函数：解析各种 URL 格式为 PIL Image
        def load_image_for_seamless(url, name="image"):
            """支持 data URL、HTTP URL、/history/ 路径、本地路径"""
            if url.startswith("data:image"):
                header, encoded = url.split(",", 1)
                image_data = base64.b64decode(encoded)
                return Image.open(BytesIO(image_data)).convert("RGB")
            elif url.startswith("http://") or url.startswith("https://"):
                resp = requests.get(url, timeout=30)
                resp.raise_for_status()
                return Image.open(BytesIO(resp.content)).convert("RGB")
            elif url.startswith("/history/") or url.startswith("history/"):
                if url.startswith("/history/"):
                    local_path = url[9:]
                else:
                    local_path = url[8:]
                abs_path = os.path.join(os.getcwd(), local_path)
                if os.path.exists(abs_path):
                    return Image.open(abs_path).convert("RGB")
                raise FileNotFoundError(f"Local file not found: {abs_path}")
            elif os.path.exists(url):
                return Image.open(url).convert("RGB")
            else:
                raise ValueError(f"Unsupported {name} source: {url[:50]}...")
        
        # 加载选区小图
        try:
            source_image = load_image_for_seamless(source_url, "source")
        except Exception as e:
            print(f"[Seamless Clone] 加载选区图失败: {e}")
            return jsonify({"error": f"Failed to load source image: {str(e)}"}), 500
        
        # 加载原图
        try:
            target_image = load_image_for_seamless(target_url, "target")
        except Exception as e:
            print(f"[Seamless Clone] 加载原图失败: {e}")
            return jsonify({"error": f"Failed to load target image: {str(e)}"}), 500
        
        # 转换为 OpenCV 格式 (BGR)
        source_cv = cv2.cvtColor(np.array(source_image), cv2.COLOR_RGB2BGR)
        target_cv = cv2.cvtColor(np.array(target_image), cv2.COLOR_RGB2BGR)
        
        h, w = source_cv.shape[:2]
        target_h, target_w = target_cv.shape[:2]
        
        # 确保选区在原图范围内
        if x < 0: x = 0
        if y < 0: y = 0
        if x + w > target_w: w = target_w - x
        if y + h > target_h: h = target_h - y
        
        if w <= 0 or h <= 0:
            return jsonify({"error": "Invalid region size"}), 400
        
        # 调整 source 大小以适配可用区域
        if source_cv.shape[:2] != (h, w):
            source_cv = cv2.resize(source_cv, (w, h))
        
        result_cv = target_cv.copy()
        
        if method == 'feather':
            # Alpha 羽化：边缘透明度渐变
            print(f"[Seamless Clone] 使用羽化融合，半径: {feather_radius}px")
            result_cv = feather_blend(source_cv, target_cv, x, y, feather_radius)
            
        elif method in ('poisson_normal', 'poisson_mixed'):
            # 泊松融合
            print(f"[Seamless Clone] 使用泊松融合，方法: {method}")
            
            # 创建 mask（选区形状）
            mask = np.ones((h, w), dtype=np.uint8) * 255
            
            # 稍微收缩 mask 边缘，避免边界问题
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.erode(mask, kernel, iterations=1)
            
            # 计算中心点
            center = (x + w // 2, y + h // 2)
            
            # 选择融合模式
            if method == 'poisson_normal':
                mode = cv2.NORMAL_CLONE
            else:  # poisson_mixed
                mode = cv2.MIXED_CLONE
            
            try:
                result_cv = cv2.seamlessClone(source_cv, target_cv, mask, center, mode)
            except cv2.error as e:
                print(f"[Seamless Clone] 泊松融合失败，降级到直接覆盖: {e}")
                # 降级：直接覆盖
                result_cv[y:y+h, x:x+w] = source_cv
        
        # 转回 PIL Image
        result_image = Image.fromarray(cv2.cvtColor(result_cv, cv2.COLOR_BGR2RGB))
        
        # 保存结果
        dirs = get_film_dirs(film_id)
        dirs["results"].mkdir(parents=True, exist_ok=True)
        result_filename = f"seamless_{method}_{uuid.uuid4().hex}.jpg"
        result_path = dirs["results"] / result_filename
        result_image.save(result_path, "JPEG", quality=95)
        
        rel_path = str(result_path.relative_to(Path(".")))
        
        print(f"[Seamless Clone] 融合完成: {result_path}, 方法: {method}")
        return jsonify({
            "success": True,
            "local_path": "/history/" + rel_path.replace("\\", "/"),
            "method": method
        })
        
    except Exception as e:
        print(f"[Seamless Clone Error] {e}")
        return jsonify({"error": f"Seamless clone failed: {str(e)}"}), 500


def feather_blend(source, target, x, y, radius=10):
    """
    Alpha 羽化融合：边缘透明度渐变
    
    Args:
        source: 选区小图 (numpy array, BGR)
        target: 原图 (numpy array, BGR)
        x, y: 左上角位置
        radius: 羽化半径（像素）
    
    Returns:
        融合后的完整图
    """
    import numpy as np
    
    h, w = source.shape[:2]
    result = target.copy()
    
    # 创建渐变 mask
    mask = np.ones((h, w), dtype=np.float32)
    
    # 四边渐变
    r = min(radius, h // 2, w // 2)
    
    if r > 0:
        # 上边缘
        for i in range(r):
            alpha = i / r
            mask[i, :] = alpha
        
        # 下边缘
        for i in range(r):
            alpha = i / r
            mask[h - 1 - i, :] = alpha
        
        # 左边缘
        for i in range(r):
            alpha = i / r
            mask[:, i] = np.minimum(mask[:, i], alpha)
        
        # 右边缘
        for i in range(r):
            alpha = i / r
            mask[:, w - 1 - i] = np.minimum(mask[:, w - 1 - i], alpha)
    
    # 扩展 mask 到 3 通道
    mask_3ch = np.stack([mask] * 3, axis=2)
    
    # 提取目标区域
    target_roi = result[y:y+h, x:x+w]
    
    # 混合：source * mask + target * (1 - mask)
    blended = source.astype(np.float32) * mask_3ch + target_roi.astype(np.float32) * (1 - mask_3ch)
    
    # 放回结果
    result[y:y+h, x:x+w] = blended.astype(np.uint8)
    
    return result


def simple_histogram_match(target, reference, strength=1.0):
    """
    简单的直方图匹配（降级方案，当 color-matcher 不可用时使用）
    基于均值和标准差的传递
    """
    import numpy as np
    
    target_np = np.array(target).astype(np.float32)
    ref_np = np.array(reference).astype(np.float32)
    
    # 分别对每个通道进行匹配
    result = target_np.copy()
    for c in range(3):
        target_mean = target_np[:, :, c].mean()
        target_std = target_np[:, :, c].std()
        ref_mean = ref_np[:, :, c].mean()
        ref_std = ref_np[:, :, c].std()
        
        # 避免除以零
        if target_std < 1e-6:
            target_std = 1e-6
        
        # 应用 Reinhard 颜色传递
        normalized = (target_np[:, :, c] - target_mean) / target_std
        result[:, :, c] = normalized * ref_std + ref_mean
    
    # 应用强度混合
    if strength < 1.0:
        result = target_np + strength * (result - target_np)
    
    # 裁剪并转换为 uint8
    result = np.clip(result, 0, 255).astype(np.uint8)
    
    return Image.fromarray(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, use_reloader=False)
