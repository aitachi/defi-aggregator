// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockAaveStrategy
 * @notice Aave策略的简化模拟，支持测试所需的所有功能
 */
contract MockAaveStrategy {
    address public vault;
    address public want;
    uint256 public apyBps; // 基点形式的APY

    uint256 public totalDeposits;
    uint256 public lastHarvestTime;
    bool public failed;
    uint256 public withdrawalLimit; // 最大提款限制

    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event Harvested(uint256 profit);
    event FailureSimulated();
    event LossSimulated(uint256 lossAmount);
    event APYUpdated(uint256 newAPY);

    constructor(address _vault, address _want, uint256 _apyBps) {
        require(_vault != address(0), "Invalid vault");
        require(_want != address(0), "Invalid want");

        vault = _vault;
        want = _want;
        apyBps = _apyBps;
        lastHarvestTime = block.timestamp;
        withdrawalLimit = type(uint256).max; // 默认无限制
    }

    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    /**
     * @notice 存款到策略
     * @param amount 存款金额
     */
    function deposit(uint256 amount) external onlyVault {
        require(amount > 0, "Amount must be > 0");
        require(!failed, "Strategy has failed");

        IERC20(want).transferFrom(msg.sender, address(this), amount);
        totalDeposits += amount;

        emit Deposited(amount);
    }

    /**
     * @notice 从策略提款
     * @param amount 提款金额
     * @return 实际提款金额
     */
    function withdraw(uint256 amount) external onlyVault returns (uint256) {
        require(amount > 0, "Amount must be > 0");
        require(totalDeposits >= amount, "Insufficient balance");

        // 应用提款限制
        uint256 actualAmount = amount;
        if (amount > withdrawalLimit) {
            actualAmount = withdrawalLimit;
        }

        totalDeposits -= actualAmount;
        IERC20(want).transfer(msg.sender, actualAmount);

        emit Withdrawn(actualAmount);
        return actualAmount;
    }

    /**
     * @notice 获取策略总资产
     * @return 总资产金额
     */
    function totalAssets() external view returns (uint256) {
        return totalDeposits;
    }

    /**
     * @notice 收获收益
     * @return 收益金额
     */
    function harvest() external returns (uint256) {
        if (failed) {
            return 0;
        }

        // 模拟收益: 基于时间和APY计算
        uint256 timeElapsed = block.timestamp - lastHarvestTime;
        uint256 profit = (totalDeposits * apyBps * timeElapsed) / (10000 * 365 days);

        lastHarvestTime = block.timestamp;

        emit Harvested(profit);
        return profit;
    }

    /**
     * @notice 获取预估APY
     * @return APY (基点)
     */
    function estimatedAPY() external view returns (uint256) {
        return apyBps;
    }

    /**
     * @notice 设置新的APY
     * @param newAPY 新的APY (基点)
     */
    function setAPY(uint256 newAPY) external {
        require(newAPY <= 50000, "APY too high"); // 最大500%
        apyBps = newAPY;
        emit APYUpdated(newAPY);
    }

    /**
     * @notice 模拟策略失败
     */
    function simulateFailure() external {
        failed = true;
        emit FailureSimulated();
    }

    /**
     * @notice 恢复策略
     */
    function recoverFromFailure() external {
        failed = false;
    }

    /**
     * @notice 模拟策略损失
     * @param bps 损失基点 (例如 1000 = 10%)
     */
    function simulateLoss(uint256 bps) external {
        require(bps <= 10000, "Loss too high");
        uint256 loss = (totalDeposits * bps) / 10000;

        if (loss > totalDeposits) {
            loss = totalDeposits;
        }

        totalDeposits -= loss;

        // 将损失的代币发送到黑洞地址以模拟真实损失
        if (loss > 0) {
            IERC20(want).transfer(address(0xdead), loss);
        }

        emit LossSimulated(loss);
    }

    /**
     * @notice 设置提款限制
     * @param limit 每次提款的最大金额
     */
    function setWithdrawalLimit(uint256 limit) external {
        withdrawalLimit = limit;
    }

    /**
     * @notice 移除提款限制
     */
    function removeWithdrawalLimit() external {
        withdrawalLimit = type(uint256).max;
    }

    /**
     * @notice 获取可用余额
     * @return 可提款的金额
     */
    function availableBalance() external view returns (uint256) {
        if (failed) {
            return 0;
        }
        return totalDeposits;
    }

    /**
     * @notice 紧急提款所有资金
     * @return 提款金额
     */
    function emergencyWithdraw() external onlyVault returns (uint256) {
        uint256 balance = totalDeposits;
        totalDeposits = 0;

        if (balance > 0) {
            IERC20(want).transfer(msg.sender, balance);
        }

        emit Withdrawn(balance);
        return balance;
    }

    /**
     * @notice 获取策略健康状态
     * @return 是否健康
     */
    function isHealthy() external view returns (bool) {
        return !failed;
    }

    /**
     * @notice 模拟收益增长（用于测试）
     * @param amount 增长金额
     */
    function simulateYield(uint256 amount) external {
        require(!failed, "Strategy has failed");
        // 假设收益已经在合约中（预先mint到策略）
        totalDeposits += amount;
    }
}