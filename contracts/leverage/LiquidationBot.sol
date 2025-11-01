// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidationBot is Ownable {

    address public leverageHelper;
    address public uniswapRouter;

    uint256 public minHealthFactor = 1e18;
    uint256 public liquidationIncentive = 105;

    mapping(address => bool) public whitelistedBots;

    event PositionLiquidated(
        address indexed user,
        uint256 indexed positionId,
        address indexed liquidator,
        uint256 debtCovered,
        uint256 collateralSeized
    );
    event BotWhitelisted(address indexed bot, bool status);

    modifier onlyWhitelistedBot() {
        require(whitelistedBots[msg.sender] || msg.sender == owner(), "Not whitelisted bot");
        _;
    }

    constructor(
        address _leverageHelper,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        require(_leverageHelper != address(0), "Invalid leverage helper");
        require(_uniswapRouter != address(0), "Invalid uniswap router");

        leverageHelper = _leverageHelper;
        uniswapRouter = _uniswapRouter;

        whitelistedBots[msg.sender] = true;
        whitelistedBots[owner()] = true;
    }

    function checkNeedsLiquidation(
        address user,
        uint256 positionId
    ) public view returns (bool) {
        // ✅ 获取健康因子
        uint256 healthFactor = ILeverageHelper(leverageHelper).getHealthFactor(user, positionId);

        // ✅ 如果健康因子小于1，需要清算
        return healthFactor < minHealthFactor;
    }

    function findLiquidatablePositions()
    external
    pure
    returns (address[] memory users)
    {
        // 简化实现：返回空数组
        users = new address[](0);
    }

    function whitelistBot(address bot, bool status) external onlyOwner {
        require(bot != address(0), "Invalid bot address");
        whitelistedBots[bot] = status;
        emit BotWhitelisted(bot, status);
    }

    function setMinHealthFactor(uint256 _minHealthFactor) external onlyOwner {
        require(_minHealthFactor > 0, "Invalid health factor");
        minHealthFactor = _minHealthFactor;
    }

    function setLeverageHelper(address _leverageHelper) external onlyOwner {
        require(_leverageHelper != address(0), "Invalid address");
        leverageHelper = _leverageHelper;
    }
}

interface ILeverageHelper {
    function getHealthFactor(address user, uint256 positionId) external view returns (uint256);
}