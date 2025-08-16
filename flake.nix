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
              echo "Phoenix dev env ready."
              echo ""
              echo "Start:   ./dev.sh start    (Linux/macOS)"
              echo "Logs:    ./dev.sh logs"
              echo "Stop:    ./dev.sh stop"
              echo ""
              echo "Windows: powershell -File .\\dev.ps1 start"
            '';
          };
        });
    };
}
