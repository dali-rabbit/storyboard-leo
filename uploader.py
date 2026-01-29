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
