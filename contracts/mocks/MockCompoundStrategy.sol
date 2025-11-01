// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockCompoundStrategy
 * @notice Compound策略的简化模拟，支持测试所需的所有功能
 */
contract MockCompoundStrategy {
    address public vault;
    address public want;
    uint256 public apyBps; // 基点形式的APY

    uint256 public totalDeposits;
    uint256 public lastHarvestTime;
    bool public failed;
    uint256 public withdrawalLimit; // 最大提款限制
    uint256 public slippageBps; // 滑点 (基点)
    uint256 public leverageMultiplier; // 杠杆倍数 (基点，10000 = 1x)

    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event Harvested(uint256 profit);
    event FailureSimulated();
    event LossSimulated(uint256 lossAmount);
    event APYUpdated(uint256 newAPY);
    event SlippageUpdated(uint256 newSlippage);
    event LeverageUpdated(uint256 newLeverage);

    constructor(address _vault, address _want, uint256 _apyBps) {
        require(_vault != address(0), "Invalid vault");
        require(_want != address(0), "Invalid want");

        vault = _vault;
        want = _want;
        apyBps = _apyBps;
        lastHarvestTime = block.timestamp;
        withdrawalLimit = type(uint256).max; // 默认无限制
        slippageBps = 0; // 默认无滑点
        leverageMultiplier = 10000; // 默认1x杠杆
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

        // 应用滑点
        uint256 actualDeposit = amount - (amount * slippageBps / 10000);
        
        // 应用杠杆效果（模拟借贷）
        uint256 leveragedAmount = (actualDeposit * leverageMultiplier) / 10000;
        totalDeposits += leveragedAmount;

        emit Deposited(leveragedAmount);
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

        // 应用滑点
        uint256 amountAfterSlippage = actualAmount - (actualAmount * slippageBps / 10000);

        // 考虑杠杆效果 - calculation kept for potential future use
        totalDeposits -= actualAmount;

        IERC20(want).transfer(msg.sender, amountAfterSlippage);

        emit Withdrawn(amountAfterSlippage);
        return amountAfterSlippage;
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
        
        // 杠杆增加收益（同时增加风险）
        uint256 effectiveAPY = (apyBps * leverageMultiplier) / 10000;
        uint256 profit = (totalDeposits * effectiveAPY * timeElapsed) / (10000 * 365 days);

        lastHarvestTime = block.timestamp;

        emit Harvested(profit);
        return profit;
    }

    /**
     * @notice 获取预估APY
     * @return APY (基点)
     */
    function estimatedAPY() external view returns (uint256) {
        // 返回杠杆调整后的APY
        return (apyBps * leverageMultiplier) / 10000;
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
     * @notice 设置滑点
     * @param _slippageBps 滑点基点 (例如 100 = 1%)
     */
    function setSlippage(uint256 _slippageBps) external {
        require(_slippageBps <= 1000, "Slippage too high"); // 最大10%
        slippageBps = _slippageBps;
        emit SlippageUpdated(_slippageBps);
    }

    /**
     * @notice 设置杠杆倍数
     * @param _multiplier 杠杆倍数 (基点，10000 = 1x, 20000 = 2x)
     */
    function setLeverage(uint256 _multiplier) external {
        require(_multiplier >= 10000, "Leverage must be >= 1x");
        require(_multiplier <= 50000, "Leverage too high"); // 最大5x
        leverageMultiplier = _multiplier;
        emit LeverageUpdated(_multiplier);
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
     * @notice 模拟清算损失（杠杆风险）
     * @param bps 清算损失基点
     */
    function simulateLiquidation(uint256 bps) external {
        require(bps <= 10000, "Liquidation loss too high");
        require(leverageMultiplier > 10000, "No leverage to liquidate");
        
        uint256 loss = (totalDeposits * bps) / 10000;
        
        if (loss > totalDeposits) {
            loss = totalDeposits;
        }
        
        totalDeposits -= loss;
        
        if (loss > 0) {
            IERC20(want).transfer(address(0xdead), loss);
        }
        
        // 重置杠杆
        leverageMultiplier = 10000;
        
        emit LossSimulated(loss);
        emit LeverageUpdated(10000);
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
        leverageMultiplier = 10000; // 重置杠杆

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

    /**
     * @notice 模拟复合收益（带杠杆）
     * @param rounds 复合轮数
     */
    function simulateCompounding(uint256 rounds) external {
        require(!failed, "Strategy has failed");
        require(rounds > 0 && rounds <= 100, "Invalid rounds");
        
        for (uint256 i = 0; i < rounds; i++) {
            // 每轮增加基于当前APY的收益
            uint256 roundProfit = (totalDeposits * apyBps * 30 days) / (10000 * 365 days);
            
            // 应用杠杆效果
            roundProfit = (roundProfit * leverageMultiplier) / 10000;
            
            totalDeposits += roundProfit;
        }
    }

    /**
     * @notice 获取杠杆信息
     * @return multiplier 当前杠杆倍数
     * @return risk 风险等级 (1-5)
     */
    function getLeverageInfo() external view returns (uint256 multiplier, uint256 risk) {
        multiplier = leverageMultiplier;
        
        // 根据杠杆计算风险等级
        if (multiplier <= 10000) {
            risk = 1; // 无杠杆，低风险
        } else if (multiplier <= 15000) {
            risk = 2; // 1-1.5x，中低风险
        } else if (multiplier <= 20000) {
            risk = 3; // 1.5-2x，中风险
        } else if (multiplier <= 30000) {
            risk = 4; // 2-3x，中高风险
        } else {
            risk = 5; // >3x，高风险
        }
    }

    /**
     * @notice 模拟市场波动
     * @param volatilityBps 波动性基点 (正数或负数)
     */
    function simulateMarketVolatility(int256 volatilityBps) external {
        require(!failed, "Strategy has failed");
        require(volatilityBps >= -5000 && volatilityBps <= 5000, "Volatility too extreme");
        
        if (volatilityBps > 0) {
            // 正向波动
            uint256 gain = (totalDeposits * uint256(volatilityBps)) / 10000;
            totalDeposits += gain;
        } else if (volatilityBps < 0) {
            // 负向波动
            uint256 loss = (totalDeposits * uint256(-volatilityBps)) / 10000;
            if (loss > totalDeposits) {
                loss = totalDeposits;
            }
            totalDeposits -= loss;
            
            if (loss > 0) {
                IERC20(want).transfer(address(0xdead), loss);
            }
            
            emit LossSimulated(loss);
        }
    }

    /**
     * @notice 获取策略的风险调整后收益
     * @return adjustedAPY 风险调整后的APY
     */
    function getRiskAdjustedAPY() external view returns (uint256 adjustedAPY) {
        // 基础APY
        uint256 baseAPY = apyBps;
        
        // 杠杆增加收益
        uint256 leveragedAPY = (baseAPY * leverageMultiplier) / 10000;
        
        // 根据杠杆调整风险折扣
        uint256 riskDiscount = 10000;
        if (leverageMultiplier > 10000) {
            // 杠杆越高，风险折扣越大
            uint256 excessLeverage = leverageMultiplier - 10000;
            riskDiscount = 10000 - (excessLeverage / 10); // 每增加0.1x杠杆，折扣1%
        }
        
        adjustedAPY = (leveragedAPY * riskDiscount) / 10000;
    }

    /**
     * @notice 检查是否需要再平衡
     * @return needsRebalance 是否需要再平衡
     * @return reason 原因描述
     */
    function checkRebalanceNeeded() external view returns (bool needsRebalance, string memory reason) {
        // 检查杠杆是否过高
        if (leverageMultiplier > 30000) {
            return (true, "Leverage too high");
        }
        
        // 检查是否有损失
        if (failed) {
            return (true, "Strategy failed");
        }
        
        // 检查滑点是否过高
        if (slippageBps > 500) {
            return (true, "Slippage too high");
        }
        
        return (false, "Strategy balanced");
    }
}