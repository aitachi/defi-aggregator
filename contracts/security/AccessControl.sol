// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AdvancedAccessControl
 * @notice 高级访问控制 - 时间锁、多签、权限继�?
 */
contract AdvancedAccessControl is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    struct TimeLock {
        uint256 executeAfter;
        bool executed;
        bytes data;
    }

    mapping(bytes32 => TimeLock) public timeLocks;
    uint256 public timeLockDuration = 2 days;

    // 多签配置
    uint256 public requiredSignatures = 2;
    mapping(bytes32 => mapping(address => bool)) public actionSignatures;
    mapping(bytes32 => uint256) public signatureCount;

    event TimeLockCreated(bytes32 indexed actionId, uint256 executeAfter);
    event TimeLockExecuted(bytes32 indexed actionId);
    event ActionSigned(bytes32 indexed actionId, address indexed signer);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice 创建时间锁操�?
     */
    function createTimeLock(bytes32 actionId, bytes calldata data)
    external
    onlyRole(ADMIN_ROLE)
    {
        require(timeLocks[actionId].executeAfter == 0, "TimeLock exists");

        timeLocks[actionId] = TimeLock({
            executeAfter: block.timestamp + timeLockDuration,
            executed: false,
            data: data
        });

        emit TimeLockCreated(actionId, block.timestamp + timeLockDuration);
    }

    /**
     * @notice 执行时间锁操�?
     */
    function executeTimeLock(bytes32 actionId)
    external
    onlyRole(ADMIN_ROLE)
    {
        TimeLock storage lock = timeLocks[actionId];
        require(lock.executeAfter > 0, "TimeLock not found");
        require(!lock.executed, "Already executed");
        require(block.timestamp >= lock.executeAfter, "Too early");

        lock.executed = true;

        // 执行数据
        (bool success, ) = address(this).call(lock.data);
        require(success, "Execution failed");

        emit TimeLockExecuted(actionId);
    }

    /**
     * @notice 签名多签操作
     */
    function signAction(bytes32 actionId)
    external
    onlyRole(ADMIN_ROLE)
    {
        require(!actionSignatures[actionId][msg.sender], "Already signed");

        actionSignatures[actionId][msg.sender] = true;
        signatureCount[actionId]++;

        emit ActionSigned(actionId, msg.sender);
    }

    /**
     * @notice 检查多签是否达到要�?
     */
    function isActionApproved(bytes32 actionId)
    public
    view
    returns (bool)
    {
        return signatureCount[actionId] >= requiredSignatures;
    }

    /**
     * @notice 执行多签操作
     */
    function executeMultiSigAction(bytes32 actionId, bytes calldata data)
    external
    onlyRole(ADMIN_ROLE)
    {
        require(isActionApproved(actionId), "Not enough signatures");

        (bool success, ) = address(this).call(data);
        require(success, "Execution failed");

        // 重置签名
        delete signatureCount[actionId];
    }

    /**
     * @notice 设置时间锁持续时�?
     */
    function setTimeLockDuration(uint256 duration)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(duration >= 1 days && duration <= 7 days, "Invalid duration");
        timeLockDuration = duration;
    }

    /**
     * @notice 设置所需签名数量
     */
    function setRequiredSignatures(uint256 count)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(count > 0 && count <= 5, "Invalid count");
        requiredSignatures = count;
    }

    /**
     * @notice 批量授予角色
     */
    function grantRoleBatch(bytes32 role, address[] calldata accounts)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            grantRole(role, accounts[i]);
        }
    }

    /**
     * @notice 批量撤销角色
     */
    function revokeRoleBatch(bytes32 role, address[] calldata accounts)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            revokeRole(role, accounts[i]);
        }
    }
}
