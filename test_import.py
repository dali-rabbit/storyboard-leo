import sys
sys.path.insert(0, 'H:\\Dev\\NewML2\\storyboard-leo')

try:
    from app import app
    print("Import OK")
except Exception as e:
    import traceback
    print(f"Import Error: {e}")
    traceback.print_exc()
