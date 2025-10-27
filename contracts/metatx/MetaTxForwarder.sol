// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract MetaTxForwarder is Ownable, EIP712 {
    using ECDSA for bytes32;

    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 nonce;
        bytes data;
        uint256 deadline;
    }

    bytes32 private constant TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data,uint256 deadline)"
    );

    uint256 public constant MAX_GAS_LIMIT = 5000000;

    mapping(address => uint256) private _nonces;
    mapping(address => bool) public relayers;

    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    event MetaTxExecuted(
        address indexed from,
        address indexed to,
        uint256 value,
        uint256 nonce,
        bool success,
        bytes returnData
    );

    constructor() Ownable(msg.sender) EIP712("MetaTxForwarder", "1") {}

    modifier onlyRelayer() {
        require(relayers[msg.sender], "Not a relayer");
        _;
    }

    function addRelayer(address relayer) external onlyOwner {
        relayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    function removeRelayer(address relayer) external onlyOwner {
        relayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    function getNonce(address from) public view returns (uint256) {
        return _nonces[from];
    }

    function verify(
        ForwardRequest calldata req,
        bytes calldata signature
    ) public view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                TYPEHASH,
                req.from,
                req.to,
                req.value,
                req.gas,
                req.nonce,
                keccak256(req.data),
                req.deadline
            )
        );

        address signer = _hashTypedDataV4(structHash).recover(signature);
        return _nonces[req.from] == req.nonce && signer == req.from;
    }

    function execute(
        ForwardRequest calldata req,
        bytes calldata signature
    ) external payable onlyRelayer returns (bool, bytes memory) {
        require(block.timestamp <= req.deadline, "Request expired");
        require(req.gas <= MAX_GAS_LIMIT, "Gas limit too high");
        require(_nonces[req.from] == req.nonce, "Invalid nonce");

        bytes32 structHash = keccak256(
            abi.encode(
                TYPEHASH,
                req.from,
                req.to,
                req.value,
                req.gas,
                req.nonce,
                keccak256(req.data),
                req.deadline
            )
        );

        address signer = _hashTypedDataV4(structHash).recover(signature);
        require(signer == req.from, "Invalid signature");

        _nonces[req.from]++;

        bytes memory dataWithSender = abi.encodePacked(req.data, req.from);

        (bool success, bytes memory returnData) = req.to.call{
                gas: req.gas,
                value: req.value
            }(dataWithSender);

        emit MetaTxExecuted(
            req.from,
            req.to,
            req.value,
            req.nonce,
            success,
            returnData
        );

        return (success, returnData);
    }

    function executeBatch(
        ForwardRequest[] calldata reqs,
        bytes[] calldata signatures
    ) external payable onlyRelayer returns (bool[] memory, bytes[] memory) {
        require(reqs.length == signatures.length, "Length mismatch");

        bool[] memory successes = new bool[](reqs.length);
        bytes[] memory returnDatas = new bytes[](reqs.length);

        for (uint256 i = 0; i < reqs.length; i++) {
            (successes[i], returnDatas[i]) = _executeOne(reqs[i], signatures[i]);
        }

        return (successes, returnDatas);
    }

    function _executeOne(
        ForwardRequest calldata req,
        bytes calldata signature
    ) private returns (bool, bytes memory) {
        require(block.timestamp <= req.deadline, "Request expired");
        require(req.gas <= MAX_GAS_LIMIT, "Gas limit too high");
        require(_nonces[req.from] == req.nonce, "Invalid nonce");

        bytes32 structHash = keccak256(
            abi.encode(
                TYPEHASH,
                req.from,
                req.to,
                req.value,
                req.gas,
                req.nonce,
                keccak256(req.data),
                req.deadline
            )
        );

        address signer = _hashTypedDataV4(structHash).recover(signature);
        require(signer == req.from, "Invalid signature");

        _nonces[req.from]++;

        bytes memory dataWithSender = abi.encodePacked(req.data, req.from);

        (bool success, bytes memory returnData) = req.to.call{
                gas: req.gas,
                value: req.value
            }(dataWithSender);

        emit MetaTxExecuted(
            req.from,
            req.to,
            req.value,
            req.nonce,
            success,
            returnData
        );

        return (success, returnData);
    }

    receive() external payable {}
}