// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface ICurvePool {
    function add_liquidity(
        uint256[2] calldata amounts,
        uint256 min_mint_amount
    ) external returns (uint256);

    function add_liquidity(
        uint256[3] calldata amounts,
        uint256 min_mint_amount
    ) external returns (uint256);

    function remove_liquidity(
        uint256 amount,
        uint256[2] calldata min_amounts
    ) external returns (uint256[2] memory);

    function remove_liquidity_one_coin(
        uint256 token_amount,
        int128 i,
        uint256 min_amount
    ) external returns (uint256);

    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    function get_virtual_price() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface ICurveGauge {
    function deposit(uint256 value) external;
    function withdraw(uint256 value) external;
    function balanceOf(address account) external view returns (uint256);
    function claim_rewards() external;
}

interface IConvexBooster {
    function deposit(
        uint256 pid,
        uint256 amount,
        bool stake
    ) external returns (bool);

    function withdraw(uint256 pid, uint256 amount) external returns (bool);

    function poolInfo(uint256 pid) external view returns (PoolInfo memory);
}

struct PoolInfo {
    address lptoken;
    address token;
    address gauge;
    address crvRewards;
    address stash;
    bool shutdown;
}

interface IConvexRewards {
    function stake(uint256 amount) external returns (bool);
    function withdraw(uint256 amount, bool claim) external returns (bool);
    function getReward() external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function earned(address account) external view returns (uint256);
}
