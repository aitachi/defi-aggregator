// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EmergencyStop
 * @notice 紧急停止机�?- 多级保护
 */
contract EmergencyStop is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    enum EmergencyLevel {
        None,           // 正常运行
        Paused,         // 暂停(可恢�?
        Frozen,         // 冻结(部分功能)
        Shutdown        // 完全关闭
    }

    EmergencyLevel public currentLevel;
    uint256 public pausedAt;
    uint256 public constant MAX_PAUSE_DURATION = 7 days;

    // 功能锁定状�?
    mapping(bytes4 => bool) public functionLocked;

    // 地址黑名�?
    mapping(address => bool) public blacklisted;

    event EmergencyLevelChanged(
        EmergencyLevel indexed oldLevel,
        EmergencyLevel indexed newLevel,
        address indexed triggeredBy
    );

    event FunctionLocked(bytes4 indexed selector);
    event FunctionUnlocked(bytes4 indexed selector);
    event AddressBlacklisted(address indexed account);
    event AddressWhitelisted(address indexed account);

    modifier whenNotPaused() {
        require(currentLevel == EmergencyLevel.None, "System paused");
        _;
    }

    modifier whenNotFrozen() {
        require(
            currentLevel != EmergencyLevel.Frozen &&
            currentLevel != EmergencyLevel.Shutdown,
            "System frozen"
        );
        _;
    }

    modifier whenNotShutdown() {
        require(currentLevel != EmergencyLevel.Shutdown, "System shutdown");
        _;
    }

    modifier notBlacklisted(address account) {
        require(!blacklisted[account], "Address blacklisted");
        _;
    }

    modifier functionNotLocked(bytes4 selector) {
        require(!functionLocked[selector], "Function locked");
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GUARDIAN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
    }

    /**
     * @notice 设置紧急级�?
     */
    function setEmergencyLevel(EmergencyLevel newLevel)
    external
    onlyRole(EMERGENCY_ROLE)
    {
        EmergencyLevel oldLevel = currentLevel;

        if (newLevel == EmergencyLevel.Paused) {
            pausedAt = block.timestamp;
        }

        currentLevel = newLevel;

        emit EmergencyLevelChanged(oldLevel, newLevel, msg.sender);
    }

    /**
     * @notice 快速暂�?
     */
    function pause() external onlyRole(GUARDIAN_ROLE) {
        require(currentLevel == EmergencyLevel.None, "Already paused");
        currentLevel = EmergencyLevel.Paused;
        pausedAt = block.timestamp;

        emit EmergencyLevelChanged(
            EmergencyLevel.None,
            EmergencyLevel.Paused,
            msg.sender
        );
    }

    /**
     * @notice 恢复运行
     */
    function unpause() external onlyRole(GUARDIAN_ROLE) {
        require(currentLevel == EmergencyLevel.Paused, "Not paused");
        require(
            block.timestamp <= pausedAt + MAX_PAUSE_DURATION,
            "Pause expired, need admin"
        );

        currentLevel = EmergencyLevel.None;
        pausedAt = 0;

        emit EmergencyLevelChanged(
            EmergencyLevel.Paused,
            EmergencyLevel.None,
            msg.sender
        );
    }

    /**
     * @notice 锁定特定功能
     */
    function lockFunction(bytes4 selector)
    external
    onlyRole(EMERGENCY_ROLE)
    {
        functionLocked[selector] = true;
        emit FunctionLocked(selector);
    }

    /**
     * @notice 解锁功能
     */
    function unlockFunction(bytes4 selector)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        functionLocked[selector] = false;
        emit FunctionUnlocked(selector);
    }

    /**
     * @notice 添加黑名�?
     */
    function blacklistAddress(address account)
    external
    onlyRole(EMERGENCY_ROLE)
    {
        blacklisted[account] = true;
        emit AddressBlacklisted(account);
    }

    /**
     * @notice 移除黑名�?
     */
    function whitelistAddress(address account)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        blacklisted[account] = false;
        emit AddressWhitelisted(account);
    }

    /**
     * @notice 检查系统状�?
     */
    function isOperational() external view returns (bool) {
        return currentLevel == EmergencyLevel.None;
    }

    /**
     * @notice 检查功能是否可�?
     */
    function isFunctionAvailable(bytes4 selector)
    external
    view
    returns (bool)
    {
        return !functionLocked[selector] &&
            currentLevel != EmergencyLevel.Shutdown;
    }
}
