// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GaslessVault is ERC20, ReentrancyGuard {

    address public immutable asset;
    address public trustedForwarder;

    event Deposited(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 amount);

    constructor(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _trustedForwarder
    ) ERC20(_name, _symbol) {
        require(_asset != address(0), "Invalid asset");
        require(_trustedForwarder != address(0), "Invalid forwarder");

        asset = _asset;
        trustedForwarder = _trustedForwarder;
    }

    function deposit(uint256 amount) external nonReentrant returns (uint256 shares) {
        require(amount > 0, "Amount must be > 0");

        address sender = _msgSender();

        IERC20(asset).transferFrom(sender, address(this), amount);

        shares = convertToShares(amount);

        _mint(sender, shares);

        emit Deposited(sender, amount, shares);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        require(shares > 0, "Shares must be > 0");

        address sender = _msgSender();
        require(balanceOf(sender) >= shares, "Insufficient shares");

        amount = convertToAssets(shares);

        _burn(sender, shares);

        IERC20(asset).transfer(sender, amount);

        emit Withdrawn(sender, shares, amount);
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return assets;
        }

        uint256 totalAssets = IERC20(asset).balanceOf(address(this));
        return (assets * supply) / totalAssets;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return 0;
        }

        uint256 totalAssets = IERC20(asset).balanceOf(address(this));
        return (shares * totalAssets) / supply;
    }

    function _msgSender() internal view override returns (address sender) {
        if (msg.sender == trustedForwarder) {
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
            if (sender == address(0)) {
                return msg.sender;
            }
        } else {
            return super._msgSender();
        }
    }

    function isTrustedForwarder(address forwarder) public view returns (bool) {
        return forwarder == trustedForwarder;
    }
}