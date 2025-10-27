// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GasStation
 * @notice Gas代付站 - 支持多种支付方式
 */
contract GasStation is Ownable {
    // 用户Gas余额 (ETH)
    mapping(address => uint256) public gasBalances;

    // 支持的代付代币
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public tokenPrices; // 1 token = X wei

    // 赞助商配置
    struct Sponsor {
        uint256 budget;          // 总预算
        uint256 used;            // 已使用
        uint256 maxPerTx;        // 单笔最多
        bool active;             // 是否激活
    }
    mapping(address => Sponsor) public sponsors;

    event GasDeposited(address indexed user, uint256 amount);
    event GasCharged(address indexed user, uint256 amount);
    event TokenDeposited(address indexed user, address token, uint256 amount);
    event SponsorAdded(address indexed sponsor, uint256 budget);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice 用户充值Gas (ETH)
     */
    function depositGas() external payable {
        require(msg.value > 0, "Cannot deposit 0");
        gasBalances[msg.sender] += msg.value;
        emit GasDeposited(msg.sender, msg.value);
    }

    /**
     * @notice 用户充值Gas (代币)
     */
    function depositGasWithToken(address token, uint256 amount) external {
        require(supportedTokens[token], "Token not supported");
        require(amount > 0, "Cannot deposit 0");

        // 转入代币
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // 换算成ETH价值
        uint256 ethValue = (amount * tokenPrices[token]) / 1e18;
        gasBalances[msg.sender] += ethValue;

        emit TokenDeposited(msg.sender, token, amount);
    }

    /**
     * @notice 扣除Gas费用
     */
    function chargeGas(address user, uint256 amount) external {
        // 检查调用者权限(应该是MetaTxForwarder)
        require(msg.sender == owner(), "Not authorized");

        // 优先使用用户余额
        if (gasBalances[user] >= amount) {
            gasBalances[user] -= amount;
            payable(tx.origin).transfer(amount); // 退款给中继者
            emit GasCharged(user, amount);
            return;
        }

        // 检查赞助商
        address sponsor = _findActiveSponsor(amount);
        if (sponsor != address(0)) {
            sponsors[sponsor].used += amount;
            payable(tx.origin).transfer(amount);
            emit GasCharged(user, amount);
            return;
        }

        revert("Insufficient gas balance");
    }

    /**
     * @notice 添加赞助商
     */
    function addSponsor(uint256 maxPerTx) external payable {
        require(msg.value > 0, "Need budget");

        sponsors[msg.sender] = Sponsor({
            budget: msg.value,
            used: 0,
            maxPerTx: maxPerTx,
            active: true
        });

        emit SponsorAdded(msg.sender, msg.value);
    }

    /**
     * @notice 添加支持的代币
     */
    function addSupportedToken(address token, uint256 price)
    external
    onlyOwner
    {
        supportedTokens[token] = true;
        tokenPrices[token] = price;
    }

    /**
     * @notice 提取Gas余额
     */
    function withdrawGas(uint256 amount) external {
        require(gasBalances[msg.sender] >= amount, "Insufficient balance");
        gasBalances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }

    function _findActiveSponsor(uint256 amount)
    internal
    view
    returns (address)
    {
        // 简单实现 - 遍历找到可用赞助商
        // 实际应该维护赞助商队列
        return address(0);
    }

    receive() external payable {}
}