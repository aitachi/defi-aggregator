// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./BaseStrategy.sol";

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IAToken {
    function balanceOf(address user) external view returns (uint256);
}

/**
 * @title AaveStrategy
 * @notice Aave V3存款策略
 */
contract AaveStrategy is BaseStrategy {
    IPool public aavePool;
    IAToken public aToken;

    address public rewardsController;

    function initialize(
        address _vault,
        address _want,
        address _aavePool,
        address _aToken
    ) external initializer {
        __BaseStrategy_init(_vault, _want);

        aavePool = IPool(_aavePool);
        aToken = IAToken(_aToken);
    }

    function _deposit(uint256 amount) internal override {
        // 批准Aave�?
        want.approve(address(aavePool), amount);

        // 存入Aave
        aavePool.supply(address(want), amount, address(this), 0);
    }

    function _withdraw(uint256 amount) internal override returns (uint256) {
        // 从Aave提取
        return aavePool.withdraw(address(want), amount, address(this));
    }

    function _harvest() internal override returns (uint256) {
        // Aave V3自动累积利息到aToken余额
        uint256 currentBalance = aToken.balanceOf(address(this));

        if (currentBalance > totalDeposited) {
            uint256 profit = currentBalance - totalDeposited;

            // 提取利润
            aavePool.withdraw(address(want), profit, address(this));

            return profit;
        }

        return 0;
    }

    function _totalAssets() internal view override returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    function estimatedAPY() external pure override returns (uint256) {
        // 简化实现 - 实际应从Aave获取当前利率
        return 300; // 3%
    }
}
