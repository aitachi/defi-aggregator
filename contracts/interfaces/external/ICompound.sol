// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IComet {
    function supply(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;

    function balanceOf(address account) external view returns (uint256);
    function borrowBalanceOf(address account) external view returns (uint256);

    function getSupplyRate(uint256 utilization) external view returns (uint64);
    function getBorrowRate(uint256 utilization) external view returns (uint64);

    function getAssetInfo(uint8 i) external view returns (AssetInfo memory);

    function getPrice(address priceFeed) external view returns (uint256);
}

struct AssetInfo {
    uint8 offset;
    address asset;
    address priceFeed;
    uint64 scale;
    uint64 borrowCollateralFactor;
    uint64 liquidateCollateralFactor;
    uint64 liquidationFactor;
    uint128 supplyCap;
}

interface ICometRewards {
    function claim(address comet, address src, bool shouldAccrue) external;
    function getRewardOwed(address comet, address account)
    external
    view
    returns (RewardOwed memory);
}

struct RewardOwed {
    address token;
    uint256 owed;
}
