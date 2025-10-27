// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vault is
    Initializable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable
{
    address public asset;
    string public vaultName;
    string public vaultSymbol;
    address public feeCollector;
    address public strategyManager;

    mapping(address => uint256) public balances;
    mapping(address => address) public strategies;
    address[] public supportedTokens;

    // 新增状态变量
    uint256 public performanceFee; // 性能费用 (基点)
    uint256 public managementFee; // 管理费用 (基点)
    uint256 public withdrawalFee; // 提款费用 (基点)
    mapping(address => uint256) public lastDepositTime; // 用户最后存款时间
    uint256 public minLockPeriod; // 最小锁定期
    bool public paused; // 暂停状态
    mapping(address => bool) public whitelisted; // 白名单
    bool public whitelistEnabled; // 是否启用白名单
    uint256 public totalValueLocked; // 总锁定价值
    mapping(address => uint256) public tokenTVL; // 每个代币的TVL

    uint256[32] private __gap; // 减少gap以容纳新变量

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event StrategySet(address indexed token, address indexed strategy);
    event FeeCollected(address indexed token, uint256 amount, string feeType);
    event FeesUpdated(uint256 performanceFee, uint256 managementFee, uint256 withdrawalFee);
    event PauseStatusChanged(bool isPaused);
    event WhitelistUpdated(address indexed user, bool status);
    event WhitelistStatusChanged(bool enabled);
    event MinLockPeriodUpdated(uint256 newPeriod);
    event EmergencyWithdrawal(address indexed user, address indexed token, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _feeCollector,
        address _strategyManager
    ) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();

        asset = _asset;
        vaultName = _name;
        vaultSymbol = _symbol;
        feeCollector = _feeCollector;
        strategyManager = _strategyManager;

        // 默认费用设置
        performanceFee = 1000; // 10%
        managementFee = 200;   // 2%
        withdrawalFee = 50;    // 0.5%
        minLockPeriod = 0;     // 默认无锁定期
        paused = false;
        whitelistEnabled = false;
    }

    modifier whenNotPaused() {
        require(!paused, "Vault is paused");
        _;
    }

    modifier onlyWhitelisted() {
        if (whitelistEnabled) {
            require(whitelisted[msg.sender], "Not whitelisted");
        }
        _;
    }

    function deposit(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyWhitelisted
    {
        require(amount > 0, "Amount must be greater than 0");

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        balances[msg.sender] += amount;
        lastDepositTime[msg.sender] = block.timestamp;

        // 更新TVL
        tokenTVL[token] += amount;
        totalValueLocked += amount;

        address strategy = strategies[token];
        if (strategy != address(0)) {
            IERC20(token).approve(strategy, amount);
            IStrategy(strategy).deposit(amount);
        }

        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        require(
            block.timestamp >= lastDepositTime[msg.sender] + minLockPeriod,
            "Lock period not expired"
        );

        balances[msg.sender] -= amount;

        // 计算提款费用
        uint256 fee = (amount * withdrawalFee) / 10000;
        uint256 amountAfterFee = amount - fee;

        address strategy = strategies[token];
        if (strategy != address(0)) {
            IStrategy(strategy).withdraw(amount);
        }

        // 更新TVL
        tokenTVL[token] -= amount;
        totalValueLocked -= amount;

        // 转账
        IERC20(token).transfer(msg.sender, amountAfterFee);

        if (fee > 0) {
            IERC20(token).transfer(feeCollector, fee);
            emit FeeCollected(token, fee, "withdrawal");
        }

        emit Withdrawn(msg.sender, token, amount);
    }

    function setStrategy(address token, address strategy) external onlyOwner {
        strategies[token] = strategy;

        bool exists = false;
        for (uint i = 0; i < supportedTokens.length; i++) {
            if (supportedTokens[i] == token) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            supportedTokens.push(token);
        }

        emit StrategySet(token, strategy);
    }

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    // ============ 新增功能函数 ============

    /**
     * @notice 设置费用参数
     * @param _performanceFee 性能费用 (基点)
     * @param _managementFee 管理费用 (基点)
     * @param _withdrawalFee 提款费用 (基点)
     */
    function setFees(
        uint256 _performanceFee,
        uint256 _managementFee,
        uint256 _withdrawalFee
    ) external onlyOwner {
        require(_performanceFee <= 3000, "Performance fee too high"); // 最大30%
        require(_managementFee <= 500, "Management fee too high");    // 最大5%
        require(_withdrawalFee <= 500, "Withdrawal fee too high");    // 最大5%

        performanceFee = _performanceFee;
        managementFee = _managementFee;
        withdrawalFee = _withdrawalFee;

        emit FeesUpdated(_performanceFee, _managementFee, _withdrawalFee);
    }

    /**
     * @notice 设置费用收集地址
     * @param _feeCollector 新的费用收集地址
     */
    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Invalid fee collector");
        feeCollector = _feeCollector;
    }

    /**
     * @notice 设置策略管理器
     * @param _strategyManager 新的策略管理器地址
     */
    function setStrategyManager(address _strategyManager) external onlyOwner {
        require(_strategyManager != address(0), "Invalid strategy manager");
        strategyManager = _strategyManager;
    }

    /**
     * @notice 设置最小锁定期
     * @param _minLockPeriod 最小锁定期 (秒)
     */
    function setMinLockPeriod(uint256 _minLockPeriod) external onlyOwner {
        require(_minLockPeriod <= 365 days, "Lock period too long");
        minLockPeriod = _minLockPeriod;
        emit MinLockPeriodUpdated(_minLockPeriod);
    }

    /**
     * @notice 暂停/恢复 vault
     * @param _paused 是否暂停
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseStatusChanged(_paused);
    }

    /**
     * @notice 启用/禁用白名单
     * @param _enabled 是否启用
     */
    function setWhitelistEnabled(bool _enabled) external onlyOwner {
        whitelistEnabled = _enabled;
        emit WhitelistStatusChanged(_enabled);
    }

    /**
     * @notice 添加/移除白名单用户
     * @param user 用户地址
     * @param status 白名单状态
     */
    function setWhitelist(address user, bool status) external onlyOwner {
        whitelisted[user] = status;
        emit WhitelistUpdated(user, status);
    }

    /**
     * @notice 批量设置白名单
     * @param users 用户地址数组
     * @param statuses 状态数组
     */
    function setWhitelistBatch(
        address[] calldata users,
        bool[] calldata statuses
    ) external onlyOwner {
        require(users.length == statuses.length, "Length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            whitelisted[users[i]] = statuses[i];
            emit WhitelistUpdated(users[i], statuses[i]);
        }
    }

    /**
     * @notice 收获策略收益
     * @param token 代币地址
     */
    function harvestStrategy(address token) external onlyOwner {
        address strategy = strategies[token];
        require(strategy != address(0), "No strategy set");

        uint256 profit = IStrategy(strategy).harvest();

        if (profit > 0) {
            uint256 fee = (profit * performanceFee) / 10000;
            if (fee > 0) {
                IERC20(token).transfer(feeCollector, fee);
                emit FeeCollected(token, fee, "performance");
            }
        }
    }

    /**
     * @notice 紧急提款（仅owner）
     * @param token 代币地址
     * @param amount 金额
     */
    function emergencyWithdraw(address token, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        require(amount > 0, "Amount must be greater than 0");

        address strategy = strategies[token];
        if (strategy != address(0)) {
            IStrategy(strategy).emergencyWithdraw();
        }

        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance >= amount, "Insufficient balance");

        IERC20(token).transfer(owner(), amount);

        emit EmergencyWithdrawal(owner(), token, amount);
    }

    /**
     * @notice 获取用户在特定代币上的余额
     * @param user 用户地址
     * @param token 代币地址
     */
    function getTokenBalance(address user, address token)
        external
        view
        returns (uint256)
    {
        return balances[user];
    }

    /**
     * @notice 获取代币的总锁定价值
     * @param token 代币地址
     */
    function getTokenTVL(address token) external view returns (uint256) {
        return tokenTVL[token];
    }

    /**
     * @notice 获取vault的总锁定价值
     */
    function getTotalValueLocked() external view returns (uint256) {
        return totalValueLocked;
    }

    /**
     * @notice 获取策略的总资产
     * @param token 代币地址
     */
    function getStrategyAssets(address token) external view returns (uint256) {
        address strategy = strategies[token];
        if (strategy == address(0)) {
            return 0;
        }
        return IStrategy(strategy).totalAssets();
    }

    /**
     * @notice 检查用户锁定期是否过期
     * @param user 用户地址
     */
    function isLockExpired(address user) external view returns (bool) {
        return block.timestamp >= lastDepositTime[user] + minLockPeriod;
    }

    /**
     * @notice 获取用户剩余锁定时间
     * @param user 用户地址
     */
    function getRemainingLockTime(address user) external view returns (uint256) {
        uint256 unlockTime = lastDepositTime[user] + minLockPeriod;
        if (block.timestamp >= unlockTime) {
            return 0;
        }
        return unlockTime - block.timestamp;
    }

    /**
     * @notice 迁移到新策略
     * @param token 代币地址
     * @param newStrategy 新策略地址
     */
    function migrateStrategy(address token, address newStrategy)
        external
        onlyOwner
    {
        address oldStrategy = strategies[token];
        require(oldStrategy != address(0), "No existing strategy");
        require(newStrategy != address(0), "Invalid new strategy");

        // 从旧策略提取所有资金
        uint256 assets = IStrategy(oldStrategy).totalAssets();
        if (assets > 0) {
            IStrategy(oldStrategy).withdraw(assets);
        }

        // 设置新策略
        strategies[token] = newStrategy;

        // 存入新策略
        if (assets > 0) {
            IERC20(token).approve(newStrategy, assets);
            IStrategy(newStrategy).deposit(assets);
        }

        emit StrategySet(token, newStrategy);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}

interface IStrategy {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256);
    function totalAssets() external view returns (uint256);
    function harvest() external returns (uint256);
    function emergencyWithdraw() external returns (uint256);
}