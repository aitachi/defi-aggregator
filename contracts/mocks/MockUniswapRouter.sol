// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockUniswapRouter
 * @notice Uniswap 路由的简化模拟
 */
contract MockUniswapRouter {

    event Swap(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /**
     * @notice 模拟代币兑换 (1:1 比例)
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        require(deadline >= block.timestamp, "Expired");

        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        // 从调用者转入 tokenIn
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // 简化: 1:1 兑换
        uint256 amountOut = amountIn;
        require(amountOut >= amountOutMin, "Insufficient output");

        // 转出 tokenOut
        IERC20(tokenOut).transfer(to, amountOut);

        emit Swap(tokenIn, tokenOut, amountIn, amountOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }

    /**
     * @notice 获取兑换输出金额 (模拟)
     */
    function getAmountsOut(uint256 amountIn, address[] calldata path)
    external
    pure
    returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;

        for (uint i = 1; i < path.length; i++) {
            amounts[i] = amountIn; // 简化: 1:1
        }
    }
}