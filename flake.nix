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

              # ── FRONTEND ──
              cd frontend

              if [ ! -d node_modules ]; then
                echo "Installing local serve..."
                npm install --save-dev serve
              fi

              if lsof -i :8080 | grep LISTEN >/dev/null 2>&1; then
                echo "Frontend already running at http://localhost:8080"
                echo "Command: npx serve . -l 8080"
              else
                echo "Starting frontend server on http://localhost:8080"
                npx serve . -l 8080 &
                echo "Command: npx serve . -l 8080"
              fi

              cd ..

              # ── BACKEND ──
              cd backend

              if [ ! -d node_modules ]; then
                echo "Installing backend dependencies..."
                npm install
              fi

              if lsof -i :3001 | grep LISTEN >/dev/null 2>&1; then
                echo "Backend already running at http://localhost:3001"
                echo "Command: node server.js"
              else
                echo "Starting backend server on http://localhost:3001"
                node server.js &
                echo "Command: node server.js"
              fi
              cd ..
            '';
          };
        });
    };
}
