{
  description = "Phoenix dev environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    in {
      devShells = nixpkgs.lib.genAttrs supportedSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            buildInputs = [
              pkgs.nodejs_20
              pkgs.python3
              pkgs.libusb1
            ];
          shellHook = ''
              echo "Phoenix dev env for ${system} ready"

              # Kill processes on exit
              cleanup() {
                echo "🛑 Stopping dev servers..."
                kill $FRONTEND_PID $BACKEND_PID $CHROME_PID 2>/dev/null || true
              }
              trap cleanup EXIT

              # ── FRONTEND ──
              cd frontend
              if [ ! -d node_modules ]; then
                echo "Installing frontend dependencies..."
                npm install
              fi
              npx serve . -l 8080 &
              FRONTEND_PID=$!
              cd ..

              # ── BACKEND ──
              cd backend
              if [ ! -d node_modules ]; then
                echo "Installing backend dependencies..."
                npm install
              fi
              node server.js &
              BACKEND_PID=$!
              cd ..

              # ── CHROME KIOSK ──
              echo "🚀 Launching Chrome in kiosk mode..."
              if [[ "$system" == *darwin* ]]; then
                /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
                  --kiosk --app=http://localhost:8080 &
              else
                google-chrome --kiosk --app=http://localhost:8080 &
              fi
              CHROME_PID=$!
            '';
          };
        });
    };
}
