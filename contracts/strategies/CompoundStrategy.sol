// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./BaseStrategy.sol";

interface IComet {
    function supply(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function getSupplyRate(uint256 utilization) external view returns (uint64);
}

/**
 * @title CompoundStrategy
 * @notice Compound V3 (Comet)策略
 */
contract CompoundStrategy is BaseStrategy {
    IComet public comet;

    function initialize(
        address _vault,
        address _want,
        address _comet
    ) external initializer {
        __BaseStrategy_init(_vault, _want);
        comet = IComet(_comet);
    }

    function _deposit(uint256 amount) internal override {
        want.approve(address(comet), amount);
        comet.supply(address(want), amount);
    }

    function _withdraw(uint256 amount) internal override returns (uint256) {
        comet.withdraw(address(want), amount);
        return amount;
    }

    function _harvest() internal override returns (uint256) {
        uint256 currentBalance = comet.balanceOf(address(this));

        if (currentBalance > totalDeposited) {
            uint256 profit = currentBalance - totalDeposited;
            comet.withdraw(address(want), profit);
            return profit;
        }

        return 0;
    }

    function _totalAssets() internal view override returns (uint256) {
        return comet.balanceOf(address(this));
    }

    function estimatedAPY() external view override returns (uint256) {
        // 从Compound获取当前利率
        uint64 supplyRate = comet.getSupplyRate(5000); // 假设50%利用�?
        return uint256(supplyRate) / 1e16; // 转换为百分比
    }
}
