pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PatientDAOFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Batch {
        uint256 id;
        bool isOpen;
        uint256 createdAt;
        uint256 closedAt;
    }
    uint256 public currentBatchId;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => uint256) public batchSubmissionCount;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted data storage
    mapping(uint256 => mapping(uint256 => euint32)) public encryptedVoteData; // batchId => index => encryptedVote
    mapping(uint256 => euint32) public encryptedTotalVotes; // batchId => encryptedTotalVotes
    mapping(uint256 => euint32) public encryptedApprovalCount; // batchId => encryptedApprovalCount

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error BatchOpen();
    error InvalidBatch();
    error ReplayDetected();
    error StateMismatch();
    error InvalidProof();

    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event ContractPaused(address indexed account);
    event ContractUnpaused(address indexed account);
    event CooldownSecondsUpdated(uint256 indexed previousCooldown, uint256 indexed newCooldown);
    event BatchOpened(uint256 indexed batchId, uint256 timestamp);
    event BatchClosed(uint256 indexed batchId, uint256 timestamp);
    event VoteSubmitted(address indexed provider, uint256 indexed batchId, uint256 encryptedVoteIndex, uint256 timestamp);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalVotes, uint256 approvalCount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60; // Default cooldown
        _initIfNeeded();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        delete isProvider[provider];
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 previousCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsUpdated(previousCooldown, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batches[currentBatchId].isOpen) revert BatchOpen();
        currentBatchId++;
        batches[currentBatchId] = Batch({
            id: currentBatchId,
            isOpen: true,
            createdAt: block.timestamp,
            closedAt: 0
        });
        batchSubmissionCount[currentBatchId] = 0;
        emit BatchOpened(currentBatchId, block.timestamp);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (batchId != currentBatchId) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (!batch.isOpen) revert BatchClosed();
        batch.isOpen = false;
        batch.closedAt = block.timestamp;
        emit BatchClosed(batchId, block.timestamp);
    }

    function submitVote(
        uint256 batchId,
        euint32 encryptedVote
    ) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (batchId != currentBatchId) revert InvalidBatch();
        if (!batches[batchId].isOpen) revert BatchClosed();

        _initIfNeeded();

        uint256 index = batchSubmissionCount[batchId]++;
        encryptedVoteData[batchId][index] = encryptedVote;

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit VoteSubmitted(msg.sender, batchId, index, block.timestamp);
    }

    function requestBatchResultDecryption(uint256 batchId)
        external
        onlyOwner
        whenNotPaused
        checkDecryptionCooldown
    {
        if (batches[batchId].isOpen) revert BatchOpen(); // Batch must be closed
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatch();

        _initIfNeeded();

        // 1. Prepare Ciphertexts
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(encryptedTotalVotes[batchId]);
        cts[1] = FHE.toBytes32(encryptedApprovalCount[batchId]);

        // 2. Compute State Hash
        bytes32 stateHash = _hashCiphertexts(cts);

        // 3. Request Decryption
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        // 4. Store Context
        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];

        // a. Replay Guard
        if (ctx.processed) revert ReplayDetected();

        // b. State Verification
        // Rebuild cts in the exact same order as in requestBatchResultDecryption
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(encryptedTotalVotes[ctx.batchId]);
        cts[1] = FHE.toBytes32(encryptedApprovalCount[ctx.batchId]);
        bytes32 currentHash = _hashCiphertexts(cts);

        if (currentHash != ctx.stateHash) {
            revert StateMismatch();
        }

        // c. Proof Verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // d. Decode & Finalize
        uint256 totalVotes = abi.decode(cleartexts, (uint256));
        uint256 approvalCount = abi.decode(cleartexts[32:], (uint256));

        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, totalVotes, approvalCount);
    }

    function calculateBatchResults(uint256 batchId) external onlyOwner whenNotPaused {
        if (batches[batchId].isOpen) revert BatchOpen(); // Batch must be closed
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatch();

        _initIfNeeded();

        euint32 memory totalVotesEnc = FHE.asEuint32(0);
        euint32 memory approvalCountEnc = FHE.asEuint32(0);

        for (uint256 i = 0; i < batchSubmissionCount[batchId]; i++) {
            euint32 memory vote = encryptedVoteData[batchId][i];
            totalVotesEnc = FHE.add(totalVotesEnc, FHE.asEuint32(1));
            if (FHE.ge(vote, FHE.asEuint32(1))) { // Assuming 1 means "approve"
                approvalCountEnc = FHE.add(approvalCountEnc, FHE.asEuint32(1));
            }
        }
        encryptedTotalVotes[batchId] = totalVotesEnc;
        encryptedApprovalCount[batchId] = approvalCountEnc;
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded() internal {
        if (!FHE.isInitialized()) {
            FHE.initialize();
        }
    }

    function _requireInitialized() internal view {
        if (!FHE.isInitialized()) {
            revert("FHE not initialized");
        }
    }
}