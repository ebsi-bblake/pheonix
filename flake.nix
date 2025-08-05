{
  description = "Dev environment for Phoenix project";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";

  outputs = { self, nixpkgs }:
    let
      # Auto-detect system from flake context
      forAllSystems = f: nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ] (system:
        f {
          pkgs = import nixpkgs { inherit system; };
          inherit system;
        }
      );
    in {
      devShells = forAllSystems ({ pkgs, system }: {
        ${system} = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs_20
            pkgs.python3
            pkgs.libusb1
          ];

          shellHook = ''
            echo "Phoenix dev env for ${system} ready"
          '';
        };
      });
    };
}
