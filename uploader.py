# uploader.py
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

# 配置
UPLOAD_BACKEND = os.getenv("UPLOAD_BACKEND", "imgbb").lower()

# GitHub + jsDelivr 配置（当 backend=github_jsdelivr 时使用）
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")
LOCAL_REPO_PATH = os.getenv("LOCAL_REPO_PATH", "")  # 本地 Git 仓库路径（绝对或相对）

# ImgBB 配置
IMGBB_API_KEY = os.getenv("IMGBB_API_KEY")

# 火山 TOS 配置（当 backend=volc_tos 时使用）
VOLC_TOS_ACCESS_KEY = os.getenv("VOLC_TOS_ACCESS_KEY")
VOLC_TOS_SECRET_KEY = os.getenv("VOLC_TOS_SECRET_KEY")
VOLC_TOS_ENDPOINT = os.getenv("VOLC_TOS_ENDPOINT", "tos-cn-beijing.volces.com")
VOLC_TOS_REGION = os.getenv("VOLC_TOS_REGION", "cn-beijing")
VOLC_TOS_BUCKET = os.getenv("VOLC_TOS_BUCKET")


class UploadError(Exception):
    pass


def upload_file(file_path: str, filename: str = None) -> str:
    """
    通用上传入口
    :param file_path: 本地文件路径（必须是 JPG）
    :param filename: 可选，用于 GitHub 模式生成路径
    :return: 外网可访问的 URL
    """
    print(f"[Uploader] 使用后端: {UPLOAD_BACKEND}")
    print(f"[Uploader] 文件路径: {file_path}")
    print(f"[Uploader] 文件大小: {Path(file_path).stat().st_size / 1024:.2f} KB")
    
    if UPLOAD_BACKEND == "github_jsdelivr":
        return _upload_to_github_jsdelivr(file_path, filename)
    elif UPLOAD_BACKEND == "imgbb":
        return _upload_to_imgbb(file_path)
    else:
        raise UploadError(f"Unsupported UPLOAD_BACKEND: {UPLOAD_BACKEND}")


def _upload_to_imgbb(file_path: str) -> str:
    """上传到 ImgBB，返回 CDN URL"""
    if not IMGBB_API_KEY:
        raise UploadError("IMGBB_API_KEY not configured")
    
    # ImgBB API 限制：免费版最大 32MB，但建议控制在 10MB 以内
    file_size = Path(file_path).stat().st_size
    if file_size > 32 * 1024 * 1024:
        raise UploadError(f"File too large: {file_size / 1024 / 1024:.2f}MB (max 32MB)")
    
    print(f"[ImgBB] API Key: {IMGBB_API_KEY[:10]}... (length: {len(IMGBB_API_KEY)})")
    
    try:
        with open(file_path, "rb") as f:
            print(f"[ImgBB] 开始上传...")
            # 增加超时设置：连接5秒，读取60秒
            resp = requests.post(
                "https://api.imgbb.com/1/upload",
                data={"key": IMGBB_API_KEY},
                files={"image": f},
                timeout=(5, 60),  # (connect timeout, read timeout)
            )
        
        print(f"[ImgBB] 响应状态码: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"[ImgBB] 错误响应: {resp.text[:500]}")
            raise UploadError(f"ImgBB upload failed: HTTP {resp.status_code} - {resp.text[:200]}")
        
        result = resp.json()
        print(f"[ImgBB] 上传成功: {result.get('data', {}).get('url', 'N/A')[:100]}")
        return result["data"]["url"]
        
    except requests.exceptions.Timeout as e:
        print(f"[ImgBB] 超时错误: {e}")
        raise UploadError(f"ImgBB upload timeout: {e}")
    except requests.exceptions.ConnectionError as e:
        print(f"[ImgBB] 连接错误: {e}")
        print(f"[ImgBB] 可能原因: 1)网络问题 2)API Key无效 3)ImgBB服务不可用")
        raise UploadError(f"ImgBB connection error: {e}")
    except Exception as e:
        print(f"[ImgBB] 未知错误: {type(e).__name__}: {e}")
        raise UploadError(f"ImgBB upload error: {e}")


def _upload_to_github_jsdelivr(file_path: str, original_filename: str = "") -> str:
    """上传到本地 Git 仓库 + 推送，返回 jsDelivr URL"""
    print(f"[GitHub] 检查配置...")
    print(f"[GitHub] USERNAME: {GITHUB_USERNAME or 'NOT SET'}")
    print(f"[GitHub] REPO: {GITHUB_REPO or 'NOT SET'}")
    print(f"[GitHub] BRANCH: {GITHUB_BRANCH}")
    print(f"[GitHub] LOCAL_REPO_PATH: {LOCAL_REPO_PATH or 'NOT SET'}")
    
    if not all([GITHUB_USERNAME, GITHUB_REPO, LOCAL_REPO_PATH]):
        raise UploadError("Missing GitHub config for jsDelivr backend")

    repo_path = Path(LOCAL_REPO_PATH).resolve()
    print(f"[GitHub] 解析后的路径: {repo_path}")
    
    if not repo_path.exists():
        raise UploadError(f"LOCAL_REPO_PATH not found: {repo_path}")

    # 生成唯一文件名（避免覆盖 & CDN 缓存问题）
    ext = ".jpg"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    remote_subdir = "images"
    remote_path = repo_path / remote_subdir / unique_name

    # 确保目录存在
    remote_path.parent.mkdir(parents=True, exist_ok=True)

    # 复制文件
    print(f"[GitHub] 复制文件到: {remote_path}")
    shutil.copy2(file_path, remote_path)

    # Git 操作
    try:
        print(f"[GitHub] 执行 git add...")
        result = subprocess.run(
            ["git", "add", str(remote_path)], 
            cwd=repo_path, 
            check=True,
            capture_output=True,
            text=True
        )
        if result.stderr:
            print(f"[GitHub] git add 警告: {result.stderr}")
        
        print(f"[GitHub] 执行 git commit...")
        result = subprocess.run(
            ["git", "commit", "-m", f"Add image via uploader: {unique_name}"],
            cwd=repo_path,
            check=True,
            capture_output=True,
            text=True
        )
        if result.stderr:
            print(f"[GitHub] git commit 警告: {result.stderr}")
        
        print(f"[GitHub] 执行 git push...")
        result = subprocess.run(
            ["git", "push", "origin", GITHUB_BRANCH], 
            cwd=repo_path, 
            check=True,
            capture_output=True,
            text=True
        )
        if result.stderr:
            print(f"[GitHub] git push 警告: {result.stderr}")
        
        print(f"[GitHub] Git 操作成功")
        
    except subprocess.CalledProcessError as e:
        print(f"[GitHub] Git 命令失败: {e}")
        print(f"[GitHub] stdout: {e.stdout if hasattr(e, 'stdout') else 'N/A'}")
        print(f"[GitHub] stderr: {e.stderr if hasattr(e, 'stderr') else 'N/A'}")
        raise UploadError(f"Git push failed: {e}")

    # 构造 jsDelivr URL（注意路径分隔符）
    jsdelivr_path = f"{remote_subdir}/{unique_name}".replace("\\", "/")
    url = f"https://cdn.jsdelivr.net/gh/{GITHUB_USERNAME}/{GITHUB_REPO}@{GITHUB_BRANCH}/{jsdelivr_path}"
    print(f"[GitHub] 生成的 URL: {url}")
    return url


# ========== 火山 TOS 上传（用于国内插件如 seedream） ==========

# 插件上传后端映射：指定插件使用哪个上传后端
PLUGIN_UPLOAD_BACKENDS = {
    "seedream": "volc_tos",  # seedream 使用火山 TOS
    # 其他插件默认使用系统配置的后端（imgbb/github）
}


def upload_file_for_plugin(file_path: str, plugin_name: str, filename: str = None) -> str:
    """
    根据插件名选择合适的上传后端
    :param file_path: 本地文件路径
    :param plugin_name: 插件名称（如 "seedream"）
    :param filename: 可选，用于生成文件名
    :return: 外网可访问的 URL
    """
    # 确定使用哪个后端
    backend = PLUGIN_UPLOAD_BACKENDS.get(plugin_name, UPLOAD_BACKEND)
    print(f"[Uploader] 插件 '{plugin_name}' 使用后端: {backend}")
    
    if backend == "volc_tos":
        return _upload_to_volc_tos(file_path, filename)
    elif backend == "github_jsdelivr":
        return _upload_to_github_jsdelivr(file_path, filename)
    else:
        return _upload_to_imgbb(file_path)


def _upload_to_volc_tos(file_path: str, filename: str = None) -> str:
    """
    上传到火山引擎对象存储 TOS，返回临时访问 URL
    文档: https://www.volcengine.com/docs/6349/92800
    预签名URL: https://www.volcengine.com/docs/6349/135725
    """
    if not all([VOLC_TOS_ACCESS_KEY, VOLC_TOS_SECRET_KEY, VOLC_TOS_BUCKET]):
        raise UploadError("VOLC_TOS 配置不完整，请检查环境变量")
    
    try:
        # 导入火山 SDK
        import tos
    except ImportError:
        raise UploadError("未安装 tos，请运行: pip install tos")
    
    # 生成唯一文件名
    ext = Path(file_path).suffix or ".jpg"
    if filename:
        unique_name = f"{uuid.uuid4().hex}_{filename}{ext}"
    else:
        unique_name = f"{uuid.uuid4().hex}{ext}"
    object_key = f"storyboard/{unique_name}"
    
    print(f"[VolcTOS] 开始上传: {object_key}")
    print(f"[VolcTOS] Bucket: {VOLC_TOS_BUCKET}")
    print(f"[VolcTOS] Endpoint: {VOLC_TOS_ENDPOINT}")
    
    try:
        # 初始化 TOS 客户端
        client = tos.TosClientV2(
            VOLC_TOS_ACCESS_KEY,
            VOLC_TOS_SECRET_KEY,
            VOLC_TOS_ENDPOINT,
            VOLC_TOS_REGION
        )
        
        # 上传文件
        with open(file_path, "rb") as f:
            client.put_object(
                bucket=VOLC_TOS_BUCKET,
                key=object_key,
                content=f
            )
        
        print(f"[VolcTOS] 上传成功")
        
        # 生成预签名 URL（临时访问链接）
        # 文档: https://www.volcengine.com/docs/6349/135725
        expires = 3600 * 24  # 24小时有效
        
        try:
            # SDK 需要 HttpMethodType 枚不（值为 Http_Method_Get 而非 GET）
            from tos.enum import HttpMethodType
            pre_signed_result = client.pre_signed_url(
                http_method=HttpMethodType.Http_Method_Get,
                bucket=VOLC_TOS_BUCKET,
                key=object_key,
                expires=expires
            )
            print(f"[VolcTOS] pre_signed_result 类型: {type(pre_signed_result)}")
            print(f"[VolcTOS] pre_signed_result 值: {pre_signed_result}")
        except Exception as e:
            print(f"[VolcTOS] pre_signed_url 调用失败: {e}")
            import traceback
            traceback.print_exc()
            raise
        
        # 处理不同版本 SDK 的返回格式
        try:
            if isinstance(pre_signed_result, tuple):
                signed_url = pre_signed_result[0]  # 可能是 (url, headers) 元组
            elif isinstance(pre_signed_result, str):
                signed_url = pre_signed_result  # 直接是字符串
            elif hasattr(pre_signed_result, 'signed_url'):
                signed_url = pre_signed_result.signed_url
            elif hasattr(pre_signed_result, 'url'):
                signed_url = pre_signed_result.url
            else:
                signed_url = str(pre_signed_result)
        except Exception as e:
            print(f"[VolcTOS] 解析返回结果失败: {e}")
            print(f"[VolcTOS] 原始返回值: {pre_signed_result}")
            raise
        
        print(f"[VolcTOS] 预签名 URL 生成成功，有效期 {expires}秒")
        print(f"[VolcTOS] URL: {signed_url[:100]}...")
        return signed_url
        
    except Exception as e:
        print(f"[VolcTOS] 上传失败: {e}")
        raise UploadError(f"火山 TOS 上传失败: {e}")
