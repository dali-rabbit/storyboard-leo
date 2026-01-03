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
    if UPLOAD_BACKEND == "github_jsdelivr":
        return _upload_to_github_jsdelivr(file_path, filename)
    elif UPLOAD_BACKEND == "imgbb":
        return _upload_to_imgbb(file_path)
    else:
        raise UploadError(f"Unsupported UPLOAD_BACKEND: {UPLOAD_BACKEND}")


def _upload_to_imgbb(file_path: str) -> str:
    """上传到 ImgBB，返回 CDN URL"""
    with open(file_path, "rb") as f:
        resp = requests.post(
            "https://api.imgbb.com/1/upload",
            data={"key": IMGBB_API_KEY},
            files={"image": f},
        )
    if resp.status_code != 200:
        raise UploadError(f"ImgBB upload failed: {resp.text}")
    return resp.json()["data"]["url"]


def _upload_to_github_jsdelivr(file_path: str, original_filename: str = "") -> str:
    """上传到本地 Git 仓库 + 推送，返回 jsDelivr URL"""
    if not all([GITHUB_USERNAME, GITHUB_REPO, LOCAL_REPO_PATH]):
        raise UploadError("Missing GitHub config for jsDelivr backend")

    repo_path = Path(LOCAL_REPO_PATH).resolve()
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
    shutil.copy2(file_path, remote_path)

    # Git 操作
    try:
        subprocess.run(["git", "add", str(remote_path)], cwd=repo_path, check=True)
        subprocess.run(
            ["git", "commit", "-m", f"Add image via uploader: {unique_name}"],
            cwd=repo_path,
            check=True,
        )
        subprocess.run(
            ["git", "push", "origin", GITHUB_BRANCH], cwd=repo_path, check=True
        )
    except subprocess.CalledProcessError as e:
        raise UploadError(f"Git push failed: {e}")

    # 构造 jsDelivr URL（注意路径分隔符）
    jsdelivr_path = f"{remote_subdir}/{unique_name}".replace("\\", "/")
    url = f"https://cdn.jsdelivr.net/gh/{GITHUB_USERNAME}/{GITHUB_REPO}@{GITHUB_BRANCH}/{jsdelivr_path}"
    return url
