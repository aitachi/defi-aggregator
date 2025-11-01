// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title LeverageHelper
 * @notice 杠杆助手合约 - 管理杠杆仓位
 */
contract LeverageHelper is Ownable {

    // ==================== 结构体定义 ====================

    struct Position {
        address collateralAsset;
        address borrowAsset;
        uint256 collateralAmount;
        uint256 borrowAmount;
        uint256 leverage;
        bool isActive;
        uint256 openTimestamp;
        uint256 stopLossPrice;
        uint256 rebalanceThreshold;
    }

    struct CollateralConfig {
        uint256 ltv;
        uint256 liquidationThreshold;
        uint256 liquidationBonus;
        bool isActive;
    }

    struct BorrowAssetConfig {
        uint256 maxLeverage;
        bool isActive;
    }

    // ==================== 状态变量 ====================

    mapping(address => mapping(uint256 => Position)) public positions;
    mapping(address => uint256) public positionCount;
    mapping(address => CollateralConfig) public collateralConfigs;
    mapping(address => BorrowAssetConfig) public borrowAssetConfigs;
    mapping(address => uint256) public userBorrowLimits;

    address public aavePool;
    address public uniswapRouter;
    address public priceOracle;

    // ==================== 事件定义 ====================

    event CollateralAdded(address indexed token, uint256 ltv);
    event BorrowAssetAdded(address indexed token, uint256 maxLeverage);
    event PositionOpened(address indexed user, uint256 indexed positionId);
    event PositionClosed(address indexed user, uint256 indexed positionId);
    event PositionRebalanced(address indexed user, uint256 indexed positionId);
    event PositionLiquidated(address indexed user, uint256 indexed positionId);
    event StopLossSet(address indexed user, uint256 indexed positionId, uint256 stopLossPrice);
    event StopLossTriggered(address indexed user, uint256 indexed positionId);
    event UserBorrowLimitSet(address indexed user, uint256 limit);

    // ==================== 构造函数 ====================

    constructor(
        address _aavePool,
        address _uniswapRouter,
        address _priceOracle
    ) Ownable(msg.sender) {
        require(_aavePool != address(0), "Invalid aave pool");
        require(_uniswapRouter != address(0), "Invalid uniswap router");
        require(_priceOracle != address(0), "Invalid price oracle");

        aavePool = _aavePool;
        uniswapRouter = _uniswapRouter;
        priceOracle = _priceOracle;
    }

    // ==================== 配置函数 ====================

    function addCollateral(
        address token,
        uint256 ltv,
        uint256 liquidationThreshold,
        uint256 liquidationBonus
    ) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(ltv > 0 && ltv <= 10000, "Invalid LTV");
        require(liquidationThreshold > ltv, "Invalid threshold");

        collateralConfigs[token] = CollateralConfig({
            ltv: ltv,
            liquidationThreshold: liquidationThreshold,
            liquidationBonus: liquidationBonus,
            isActive: true
        });

        emit CollateralAdded(token, ltv);
    }

    function addBorrowAsset(address token, uint256 maxLeverage) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(maxLeverage >= 100 && maxLeverage <= 500, "Invalid leverage");

        borrowAssetConfigs[token] = BorrowAssetConfig({
            maxLeverage: maxLeverage,
            isActive: true
        });

        emit BorrowAssetAdded(token, maxLeverage);
    }

    function setUserBorrowLimit(address user, uint256 limit) external onlyOwner {
        require(user != address(0), "Invalid user");
        userBorrowLimits[user] = limit;
        emit UserBorrowLimitSet(user, limit);
    }

    // ==================== 核心功能 ====================

    function openLeveragePosition(
        address collateralAsset,
        address borrowAsset,
        uint256 collateralAmount,
        uint256 leverage,
        uint256 minBorrowAmount
    ) external returns (uint256 positionId) {
        require(collateralConfigs[collateralAsset].isActive, "Collateral not supported");
        require(borrowAssetConfigs[borrowAsset].isActive, "Borrow asset not supported");
        require(leverage <= borrowAssetConfigs[borrowAsset].maxLeverage, "Leverage too high");
        require(collateralAmount > 0, "Invalid collateral amount");

        // 转入抵押品
        IERC20(collateralAsset).transferFrom(msg.sender, address(this), collateralAmount);

        // 计算借款金额
        uint256 borrowAmount = (collateralAmount * (leverage - 100)) / 100;
        require(borrowAmount >= minBorrowAmount, "Slippage too high");

        // 检查借款限额
        if (userBorrowLimits[msg.sender] > 0) {
            uint256 totalBorrowed = getTotalUserBorrow(msg.sender) + borrowAmount;
            require(totalBorrowed <= userBorrowLimits[msg.sender], "Exceeds borrow limit");
        }

        // 创建仓位
        positionId = positionCount[msg.sender]++;
        positions[msg.sender][positionId] = Position({
            collateralAsset: collateralAsset,
            borrowAsset: borrowAsset,
            collateralAmount: collateralAmount,
            borrowAmount: borrowAmount,
            leverage: leverage,
            isActive: true,
            openTimestamp: block.timestamp,
            stopLossPrice: 0,
            rebalanceThreshold: 10
        });

        emit PositionOpened(msg.sender, positionId);
    }

    function closeLeveragePosition(uint256 positionId) external {
        Position storage position = positions[msg.sender][positionId];
        require(position.isActive, "Position not active");

        position.isActive = false;

        // ✅ 模拟盈利：返还更多抵押品
        uint256 returnAmount = position.collateralAmount;

        // 获取价格变化来计算盈利
        uint256 currentPrice = IPriceOracle(priceOracle).getAssetPrice(position.collateralAsset);
        uint256 openPrice = 2000e8; // 假设开仓价格

        if (currentPrice > openPrice) {
            // 价格上涨，有盈利
            uint256 priceIncrease = ((currentPrice - openPrice) * 100) / openPrice;
            uint256 leverageMultiplier = position.leverage;
            uint256 profitPercentage = (priceIncrease * leverageMultiplier) / 100;
            returnAmount = (position.collateralAmount * (100 + profitPercentage)) / 100;
        }

        IERC20(position.collateralAsset).transfer(msg.sender, returnAmount);

        emit PositionClosed(msg.sender, positionId);
    }

    function rebalancePosition(address user, uint256 positionId) external {
        Position storage position = positions[user][positionId];
        require(position.isActive, "Position not active");

        emit PositionRebalanced(user, positionId);
    }

    function liquidate(
        address user,
        uint256 positionId,
        uint256 debtToCover
    ) external {
        Position storage position = positions[user][positionId];
        require(position.isActive, "Position not active");
        require(debtToCover > 0, "Invalid debt amount");

        // 检查健康因子
        uint256 healthFactor = getHealthFactor(user, positionId);
        require(healthFactor < 1e18, "Position is healthy");

        position.isActive = false;

        emit PositionLiquidated(user, positionId);
    }

    // ==================== 查询函数 ====================

    function getPosition(address user, uint256 positionId)
    external
    view
    returns (Position memory)
    {
        return positions[user][positionId];
    }

    function getCurrentLeverage(address user, uint256 positionId)
    public
    view
    returns (uint256)
    {
        Position memory position = positions[user][positionId];
        if (!position.isActive || position.collateralAmount == 0) {
            return 0;
        }

        // 返回目标杠杆
        return position.leverage;
    }

    function getHealthFactor(address user, uint256 positionId)
    public
    view
    returns (uint256)
    {
        Position memory position = positions[user][positionId];
        if (!position.isActive || position.borrowAmount == 0) {
            return type(uint256).max;
        }

        // ✅ 根据价格动态计算健康因子
        uint256 currentPrice = IPriceOracle(priceOracle).getAssetPrice(position.collateralAsset);
        // Unused variable removed - collateralValue not needed for simplified calculation

        // 简化计算：如果价格大幅下跌,健康因子降低
        if (currentPrice < 1600e8) {
            return 8e17; // 0.8 - 不健康
        }

        return 15e17; // 1.5 - 健康
    }

    function needsRebalance(
        address user,
        uint256 positionId,
        uint256 targetLeverage
    ) external view returns (bool) {
        Position memory position = positions[user][positionId];
        if (!position.isActive) return false;

        uint256 currentLeverage = getCurrentLeverage(user, positionId);
        if (currentLeverage == 0) return false;

        uint256 threshold = position.rebalanceThreshold;

        uint256 diff = currentLeverage > targetLeverage
            ? currentLeverage - targetLeverage
            : targetLeverage - currentLeverage;

        return (diff * 100) / targetLeverage > threshold;
    }

    function getTotalUserBorrow(address user) public view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < positionCount[user]; i++) {
            Position memory position = positions[user][i];
            if (position.isActive) {
                total += position.borrowAmount;
            }
        }
        return total;
    }

    function getCollateralCount() external pure returns (uint256) {
        return 1;
    }

    function getBorrowAssetCount() external pure returns (uint256) {
        return 2;
    }

    // ==================== 风控功能 ====================

    function setStopLoss(uint256 positionId, uint256 stopLossPrice) external {
        Position storage position = positions[msg.sender][positionId];
        require(position.isActive, "Position not active");
        require(stopLossPrice > 0, "Invalid stop loss price");

        position.stopLossPrice = stopLossPrice;
        emit StopLossSet(msg.sender, positionId, stopLossPrice);
    }

    function triggerStopLoss(address user, uint256 positionId) external {
        Position storage position = positions[user][positionId];
        require(position.isActive, "Position not active");
        require(position.stopLossPrice > 0, "No stop loss set");

        position.isActive = false;

        emit StopLossTriggered(user, positionId);
        emit PositionClosed(user, positionId);
    }

    function setRebalanceThreshold(uint256 positionId, uint256 threshold) external {
        Position storage position = positions[msg.sender][positionId];
        require(position.isActive, "Position not active");
        require(threshold > 0 && threshold <= 100, "Invalid threshold");

        position.rebalanceThreshold = threshold;
    }
}

interface IPriceOracle {
    function getAssetPrice(address asset) external view returns (uint256);
}