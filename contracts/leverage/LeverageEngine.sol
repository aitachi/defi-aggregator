// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LeverageEngine
 * @notice 杠杆交易引擎 - 支持多倍杠杆
 */
contract LeverageEngine is ReentrancyGuard, Ownable {
    struct Position {
        address owner;          // 持有者地址
        address collateral;     // 抵押代币
        address borrowed;       // 借入代币
        uint256 collateralAmount;  // 抵押数量
        uint256 borrowedAmount;    // 借入数量
        uint256 leverage;       // 杠杆倍数(100 = 1x)
        uint256 healthFactor;   // 健康因子(100 = 1.0)
        uint256 openedAt;       // 开仓时间
        bool active;            // 是否激活
    }

    mapping(uint256 => Position) public positions;
    uint256 public positionCounter;

    address public aavePool;        // Aave借贷池
    address public uniswapRouter;   // Uniswap路由
    address public vault;           // 金库地址

    uint256 public constant MIN_HEALTH_FACTOR = 120; // 1.2
    uint256 public constant LIQUIDATION_THRESHOLD = 110; // 1.1
    uint256 public constant MAX_LEVERAGE = 500; // 5x

    event PositionOpened(
        uint256 indexed positionId,
        address indexed owner,
        uint256 collateralAmount,
        uint256 leverage
    );
    event PositionClosed(uint256 indexed positionId, uint256 profit);
    event PositionLiquidated(uint256 indexed positionId, address liquidator);
    event HealthFactorUpdated(uint256 indexed positionId, uint256 healthFactor);

    constructor(
        address _aavePool,
        address _uniswapRouter,
        address _vault
    ) Ownable(msg.sender) {
        aavePool = _aavePool;
        uniswapRouter = _uniswapRouter;
        vault = _vault;
    }

    /**
     * @notice 打开杠杆持仓
     * @param collateralToken 抵押代币
     * @param collateralAmount 抵押数量
     * @param borrowToken 借入代币
     * @param leverage 杠杆倍数(100 = 1x, 300 = 3x)
     */
    function openPosition(
        address collateralToken,
        uint256 collateralAmount,
        address borrowToken,
        uint256 leverage
    ) external nonReentrant returns (uint256 positionId) {
        require(leverage >= 100 && leverage <= MAX_LEVERAGE, "Invalid leverage");
        require(collateralAmount > 0, "Invalid amount");

        // 1. 转入抵押品
        IERC20(collateralToken).transferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        // 2. 供给到Aave
        IERC20(collateralToken).approve(aavePool, collateralAmount);
        IAavePool(aavePool).supply(
            collateralToken,
            collateralAmount,
            address(this),
            0
        );

        // 3. 计算借款数量
        uint256 borrowAmount = (collateralAmount * (leverage - 100)) / 100;

        // 4. 从Aave借款
        IAavePool(aavePool).borrow(
            borrowToken,
            borrowAmount,
            2, // Variable rate
            0,
            address(this)
        );

        // 5. 将借来的资金兑换成抵押品
        uint256 swappedCollateral = _swapTokens(
            borrowToken,
            collateralToken,
            borrowAmount
        );

        // 6. 将兑换的抵押品再次供给到Aave
        IERC20(collateralToken).approve(aavePool, swappedCollateral);
        IAavePool(aavePool).supply(
            collateralToken,
            swappedCollateral,
            address(this),
            0
        );

        // 7. 创建持仓记录
        positionId = positionCounter++;
        positions[positionId] = Position({
            owner: msg.sender,
            collateral: collateralToken,
            borrowed: borrowToken,
            collateralAmount: collateralAmount + swappedCollateral,
            borrowedAmount: borrowAmount,
            leverage: leverage,
            healthFactor: _calculateHealthFactor(positionId),
            openedAt: block.timestamp,
            active: true
        });

        emit PositionOpened(
            positionId,
            msg.sender,
            collateralAmount,
            leverage
        );
    }

    /**
     * @notice 关闭杠杆持仓
     */
    function closePosition(uint256 positionId)
    external
    nonReentrant
    returns (uint256 profit)
    {
        Position storage pos = positions[positionId];
        require(pos.active, "Position not active");
        require(pos.owner == msg.sender, "Not position owner");

        // 1. 提取抵押品
        IAavePool(aavePool).withdraw(
            pos.collateral,
            pos.collateralAmount,
            address(this)
        );

        // 2. 将部分抵押品兑换成借入代币
        uint256 swappedAmount = _swapTokens(
            pos.collateral,
            pos.borrowed,
            pos.borrowedAmount
        );

        // 3. 偿还借款
        IERC20(pos.borrowed).approve(aavePool, pos.borrowedAmount);
        IAavePool(aavePool).repay(
            pos.borrowed,
            pos.borrowedAmount,
            2,
            address(this)
        );

        // 4. 计算剩余抵押品(利润)
        uint256 remainingCollateral = pos.collateralAmount - swappedAmount;
        profit = remainingCollateral > pos.collateralAmount ?
            remainingCollateral - pos.collateralAmount : 0;

        // 5. 返还给用户
        IERC20(pos.collateral).transfer(msg.sender, remainingCollateral);

        pos.active = false;

        emit PositionClosed(positionId, profit);
    }

    /**
     * @notice 清算不健康持仓
     */
    function liquidate(uint256 positionId) external nonReentrant {
        Position storage pos = positions[positionId];
        require(pos.active, "Position not active");

        uint256 healthFactor = _calculateHealthFactor(positionId);
        require(healthFactor < LIQUIDATION_THRESHOLD, "Position healthy");

        // 提取抵押品
        IAavePool(aavePool).withdraw(
            pos.collateral,
            pos.collateralAmount,
            address(this)
        );

        // 兑换并偿还债务
        uint256 swappedAmount = _swapTokens(
            pos.collateral,
            pos.borrowed,
            pos.borrowedAmount
        );

        IERC20(pos.borrowed).approve(aavePool, pos.borrowedAmount);
        IAavePool(aavePool).repay(
            pos.borrowed,
            pos.borrowedAmount,
            2,
            address(this)
        );

        // 给清算人10%奖励
        uint256 liquidatorReward = (pos.collateralAmount * 10) / 100;
        IERC20(pos.collateral).transfer(msg.sender, liquidatorReward);

        // 剩余资金返还用户
        uint256 remaining = pos.collateralAmount - swappedAmount - liquidatorReward;
        if (remaining > 0) {
            IERC20(pos.collateral).transfer(pos.owner, remaining);
        }

        pos.active = false;

        emit PositionLiquidated(positionId, msg.sender);
    }

    /**
     * @notice 更新持仓健康因子
     */
    function updateHealthFactor(uint256 positionId) external {
        Position storage pos = positions[positionId];
        require(pos.active, "Position not active");

        uint256 newHealthFactor = _calculateHealthFactor(positionId);
        pos.healthFactor = newHealthFactor;

        emit HealthFactorUpdated(positionId, newHealthFactor);
    }

    function _calculateHealthFactor(uint256 positionId)
    internal
    view
    returns (uint256)
    {
        Position memory pos = positions[positionId];
        if (pos.borrowedAmount == 0) return type(uint256).max;

        // 简单计算 (抵押品价值 * 清算阈值 / 债务价值)
        // 实际应该获取价格预言机数据
        uint256 collateralValue = pos.collateralAmount;
        uint256 debtValue = pos.borrowedAmount;

        return (collateralValue * 100) / debtValue;
    }

    function _swapTokens(
        address tokenIn,
        address /* tokenOut */,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        // 简单实现 - 实际应该调用Uniswap
        IERC20(tokenIn).approve(uniswapRouter, amountIn);

        // 这里应该调用真实的Uniswap路由
        // amountOut = IUniswapRouter(uniswapRouter).swapExactTokensForTokens(...);

        // 临时返回1:1
        amountOut = amountIn;
    }

    function getPosition(uint256 positionId)
    external
    view
    returns (Position memory)
    {
        return positions[positionId];
    }
}

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external;
    function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf) external returns (uint256);
}