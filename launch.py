# /// script
# requires-python = ">=3.10"
# ///

import os
import sys
import time
import argparse
import subprocess
import webbrowser

def main():
    parser = argparse.ArgumentParser(description="Launch Get It. locally without Electron")
    parser.add_argument("--byok", action="store_true", help="Launch using BYOK (Bring Your Own Key) provider for custom endpoints")
    args = parser.parse_args()

    # Determine project root and cd to it so `npm run` works correctly
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)

    use_shell = sys.platform == "win32"

    # Check if node_modules exists, run npm install if it doesn't
    if not os.path.exists("node_modules"):
        print("node_modules not found. Running 'npm install'...")
        try:
            subprocess.run(["npm", "install"], shell=use_shell, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error running npm install: {e}")
            sys.exit(1)

    env = os.environ.copy()
    if args.byok:
        env["NEXT_PUBLIC_DEFAULT_PROVIDER"] = "byok"

    print("Starting Next.js server...")
    proc = subprocess.Popen(["npm", "run", "browser:dev"], env=env, shell=use_shell)
    
    # Wait a bit for the Next.js server to start up
    time.sleep(3)
    
    url = "http://localhost:3000"
    print(f"\nOpening {url} in your default browser...\n")
    webbrowser.open(url)
    
    try:
        proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        proc.terminate()

if __name__ == "__main__":
    main()
