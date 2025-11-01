// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./BaseStrategy.sol";

interface ICurvePool {
    function add_liquidity(uint256[2] calldata amounts, uint256 min_mint_amount) external returns (uint256);
    function remove_liquidity_one_coin(uint256 token_amount, int128 i, uint256 min_amount) external returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface IConvexBooster {
    function deposit(uint256 pid, uint256 amount, bool stake) external returns (bool);
    function withdraw(uint256 pid, uint256 amount) external returns (bool);
}

interface IConvexRewards {
    function getReward() external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title CurveStrategy
 * @notice Curve + Convex组合策略
 */
contract CurveStrategy is BaseStrategy {
    ICurvePool public curvePool;
    IConvexBooster public convexBooster;
    IConvexRewards public convexRewards;

    uint256 public poolId;
    address public lpToken;
    address public crvToken;
    address public cvxToken;

    function initialize(
        address _vault,
        address _want,
        address _curvePool,
        address _convexBooster,
        address _convexRewards,
        uint256 _poolId,
        address _lpToken,
        address _crvToken,
        address _cvxToken
    ) external initializer {
        __BaseStrategy_init(_vault, _want);

        curvePool = ICurvePool(_curvePool);
        convexBooster = IConvexBooster(_convexBooster);
        convexRewards = IConvexRewards(_convexRewards);
        poolId = _poolId;
        lpToken = _lpToken;
        crvToken = _crvToken;
        cvxToken = _cvxToken;
    }

    function _deposit(uint256 amount) internal override {
        // 1. 添加流动性到Curve
        want.approve(address(curvePool), amount);
        uint256[2] memory amounts;
        amounts[0] = amount; // 假设want是第一个代�?
        uint256 lpReceived = curvePool.add_liquidity(amounts, 0);

        // 2. 质押LP到Convex
        IERC20(lpToken).approve(address(convexBooster), lpReceived);
        convexBooster.deposit(poolId, lpReceived, true);
    }

    function _withdraw(uint256 amount) internal override returns (uint256) {
        // 计算需要提取的LP数量
        uint256 totalLP = convexRewards.balanceOf(address(this));
        uint256 lpToWithdraw = (amount * totalLP) / totalDeposited;

        // 1. 从Convex提取LP
        convexBooster.withdraw(poolId, lpToWithdraw);

        // 2. 从Curve移除流动�?
        IERC20(lpToken).approve(address(curvePool), lpToWithdraw);
        return curvePool.remove_liquidity_one_coin(lpToWithdraw, 0, 0);
    }

    function _harvest() internal override returns (uint256) {
        // 领取Convex奖励(CRV + CVX)
        convexRewards.getReward();

        uint256 crvBalance = IERC20(crvToken).balanceOf(address(this));
        uint256 cvxBalance = IERC20(cvxToken).balanceOf(address(this));

        uint256 totalProfit = 0;

        // 将CRV换成want (简�?- 实际需要通过DEX)
        if (crvBalance > 0) {
            totalProfit += crvBalance;
        }

        // 将CVX换成want
        if (cvxBalance > 0) {
            totalProfit += cvxBalance;
        }

        return totalProfit;
    }

    function _totalAssets() internal view override returns (uint256) {
        uint256 lpBalance = convexRewards.balanceOf(address(this));
        // 简�?- 实际需要计算LP价�?
        return lpBalance;
    }

    function estimatedAPY() external pure override returns (uint256) {
        // Curve基础APY + Convex奖励APY
        return 500; // 5%
    }
}
