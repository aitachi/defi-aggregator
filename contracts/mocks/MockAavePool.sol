// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockAavePool {
    mapping(address => uint256) public assetPrices;

    function setAssetPrice(address asset, uint256 price) external {
        assetPrices[asset] = price;
    }

    function getAssetPrice(address asset) external view returns (uint256) {
        return assetPrices[asset];
    }

    function supply(address asset, uint256 amount, address /* onBehalfOf */, uint16 /* referralCode */) external {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
    }

    function borrow(
        address asset,
        uint256 amount,
        uint256 /* interestRateMode */,
        uint16 /* referralCode */,
        address /* onBehalfOf */
    ) external {
        IERC20(asset).transfer(msg.sender, amount);
    }

    function repay(
        address asset,
        uint256 amount,
        uint256 /* rateMode */,
        address /* onBehalfOf */
    ) external returns (uint256) {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        return amount;
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        IERC20(asset).transfer(to, amount);
        return amount;
    }
}