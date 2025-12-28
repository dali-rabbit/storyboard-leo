# test_gen_api.py
from plugins import get_plugin, load_plugins

load_plugins()


def generate_via_image_fallback(
    image_urls, prompt, size="2K", ar="auto", fallback_order=None
):
    if fallback_order is None:
        fallback_order = ["nano_banana", "rh_third", "rh_official"]

    for name in fallback_order:
        func = get_plugin(name)
        if not func:
            print(f"[Plugin] 未找到: {name}")
            continue
        print(f"🚀 尝试插件: {name}")
        try:
            result = func(image_urls=image_urls, prompt=prompt, size=size, ar=ar)
            if result:
                return result
        except Exception as e:
            print(f"[Plugin {name}] 异常: {e}")
    return []
