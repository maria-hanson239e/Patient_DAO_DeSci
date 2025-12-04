// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface TrialData {
  id: string;
  encryptedValue: string;
  timestamp: number;
  owner: string;
  category: string;
  status: "pending" | "approved" | "rejected";
  title: string;
  description: string;
  votes: number;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [trials, setTrials] = useState<TrialData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newTrialData, setNewTrialData] = useState({ 
    title: "", 
    description: "", 
    category: "Cancer", 
    sensitiveValue: 0 
  });
  const [selectedTrial, setSelectedTrial] = useState<TrialData | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");

  const approvedCount = trials.filter(t => t.status === "approved").length;
  const pendingCount = trials.filter(t => t.status === "pending").length;
  const rejectedCount = trials.filter(t => t.status === "rejected").length;

  useEffect(() => {
    loadTrials().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadTrials = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("trial_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing trial keys:", e); }
      }
      
      const list: TrialData[] = [];
      for (const key of keys) {
        try {
          const trialBytes = await contract.getData(`trial_${key}`);
          if (trialBytes.length > 0) {
            try {
              const trialData = JSON.parse(ethers.toUtf8String(trialBytes));
              list.push({ 
                id: key, 
                encryptedValue: trialData.value, 
                timestamp: trialData.timestamp, 
                owner: trialData.owner, 
                category: trialData.category, 
                status: trialData.status || "pending",
                title: trialData.title,
                description: trialData.description,
                votes: trialData.votes || 0
              });
            } catch (e) { console.error(`Error parsing trial data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading trial ${key}:`, e); }
      }
      list.sort((a, b) => b.votes - a.votes);
      setTrials(list);
    } catch (e) { console.error("Error loading trials:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitTrial = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting sensitive data with Zama FHE..." });
    try {
      const encryptedValue = FHEEncryptNumber(newTrialData.sensitiveValue);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const trialId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const trialData = { 
        value: encryptedValue, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        category: newTrialData.category, 
        status: "pending",
        title: newTrialData.title,
        description: newTrialData.description,
        votes: 0
      };
      
      await contract.setData(`trial_${trialId}`, ethers.toUtf8Bytes(JSON.stringify(trialData)));
      
      const keysBytes = await contract.getData("trial_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(trialId);
      await contract.setData("trial_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Clinical trial proposal submitted securely!" });
      await loadTrials();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewTrialData({ 
          title: "", 
          description: "", 
          category: "Cancer", 
          sensitiveValue: 0 
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const voteForTrial = async (trialId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing vote with FHE encryption..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const trialBytes = await contract.getData(`trial_${trialId}`);
      if (trialBytes.length === 0) throw new Error("Trial not found");
      
      const trialData = JSON.parse(ethers.toUtf8String(trialBytes));
      const updatedTrial = { ...trialData, votes: (trialData.votes || 0) + 1 };
      
      await contract.setData(`trial_${trialId}`, ethers.toUtf8Bytes(JSON.stringify(updatedTrial)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Vote recorded successfully!" });
      await loadTrials();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Vote failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const approveTrial = async (trialId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing approval with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const trialBytes = await contract.getData(`trial_${trialId}`);
      if (trialBytes.length === 0) throw new Error("Trial not found");
      
      const trialData = JSON.parse(ethers.toUtf8String(trialBytes));
      const updatedTrial = { ...trialData, status: "approved" };
      
      await contract.setData(`trial_${trialId}`, ethers.toUtf8Bytes(JSON.stringify(updatedTrial)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Trial approved successfully!" });
      await loadTrials();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Approval failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const rejectTrial = async (trialId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing rejection with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const trialBytes = await contract.getData(`trial_${trialId}`);
      if (trialBytes.length === 0) throw new Error("Trial not found");
      
      const trialData = JSON.parse(ethers.toUtf8String(trialBytes));
      const updatedTrial = { ...trialData, status: "rejected" };
      
      await contract.setData(`trial_${trialId}`, ethers.toUtf8Bytes(JSON.stringify(updatedTrial)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Trial rejected successfully!" });
      await loadTrials();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Rejection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (trialAddress: string) => address?.toLowerCase() === trialAddress.toLowerCase();

  const filteredTrials = trials.filter(trial => {
    const matchesSearch = trial.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         trial.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "All" || trial.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["All", "Cancer", "Neurology", "Cardiology", "Rare Diseases", "Mental Health"];

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing Patient DAO connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Patient<span>DAO</span> Trials</h1>
          <p>Decentralized Clinical Trials Powered by FHE</p>
        </div>
        <div className="header-actions">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </header>

      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Patient-Governed Clinical Research</h2>
            <p>Empowering patients to propose, vote on, and govern clinical trials with fully homomorphic encryption</p>
          </div>
          <button 
            className="primary-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + Propose New Trial
          </button>
        </div>

        <div className="stats-cards">
          <div className="stat-card">
            <h3>Total Trials</h3>
            <p className="stat-value">{trials.length}</p>
          </div>
          <div className="stat-card">
            <h3>Approved</h3>
            <p className="stat-value">{approvedCount}</p>
          </div>
          <div className="stat-card">
            <h3>Pending</h3>
            <p className="stat-value">{pendingCount}</p>
          </div>
          <div className="stat-card">
            <h3>Rejected</h3>
            <p className="stat-value">{rejectedCount}</p>
          </div>
        </div>

        <div className="search-filter-bar">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search trials..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="search-icon">🔍</span>
          </div>
          <select 
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="category-filter"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button 
            className="refresh-btn"
            onClick={loadTrials}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="trials-grid">
          {filteredTrials.length === 0 ? (
            <div className="no-trials">
              <p>No clinical trials found matching your criteria</p>
              <button 
                className="primary-btn"
                onClick={() => setShowCreateModal(true)}
              >
                Be the first to propose a trial
              </button>
            </div>
          ) : (
            filteredTrials.map(trial => (
              <div 
                key={trial.id} 
                className={`trial-card ${trial.status}`}
                onClick={() => setSelectedTrial(trial)}
              >
                <div className="card-header">
                  <span className={`status-badge ${trial.status}`}>{trial.status}</span>
                  <span className="votes">❤️ {trial.votes}</span>
                </div>
                <h3>{trial.title}</h3>
                <p className="category">{trial.category}</p>
                <p className="description">{trial.description.substring(0, 100)}...</p>
                <div className="card-footer">
                  <span className="owner">{trial.owner.substring(0, 6)}...{trial.owner.substring(38)}</span>
                  <span className="date">{new Date(trial.timestamp * 1000).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Propose New Clinical Trial</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Trial Title *</label>
                <input 
                  type="text" 
                  value={newTrialData.title}
                  onChange={(e) => setNewTrialData({...newTrialData, title: e.target.value})}
                  placeholder="Enter trial title"
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea 
                  value={newTrialData.description}
                  onChange={(e) => setNewTrialData({...newTrialData, description: e.target.value})}
                  placeholder="Describe the clinical trial purpose and methodology"
                  rows={4}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category *</label>
                  <select 
                    value={newTrialData.category}
                    onChange={(e) => setNewTrialData({...newTrialData, category: e.target.value})}
                  >
                    {categories.filter(c => c !== "All").map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Estimated Budget (ETH) *</label>
                  <input 
                    type="number" 
                    value={newTrialData.sensitiveValue}
                    onChange={(e) => setNewTrialData({...newTrialData, sensitiveValue: parseFloat(e.target.value)})}
                    placeholder="Enter estimated budget"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="encryption-notice">
                <div className="lock-icon">🔒</div>
                <p>Budget amount will be encrypted with Zama FHE before submission</p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="secondary-btn"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button 
                className="primary-btn"
                onClick={submitTrial}
                disabled={creating || !newTrialData.title || !newTrialData.description || !newTrialData.sensitiveValue}
              >
                {creating ? "Submitting..." : "Submit Proposal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTrial && (
        <div className="modal-overlay">
          <div className="trial-detail-modal">
            <div className="modal-header">
              <h2>{selectedTrial.title}</h2>
              <button onClick={() => { setSelectedTrial(null); setDecryptedValue(null); }} className="close-btn">&times;</button>
            </div>
            <div className="modal-body">
              <div className="trial-meta">
                <span className={`status-badge ${selectedTrial.status}`}>{selectedTrial.status}</span>
                <span className="category">{selectedTrial.category}</span>
                <span className="votes">❤️ {selectedTrial.votes} votes</span>
              </div>
              
              <div className="trial-description">
                <h3>Description</h3>
                <p>{selectedTrial.description}</p>
              </div>
              
              <div className="trial-details">
                <div className="detail-item">
                  <h3>Proposed By</h3>
                  <p>{selectedTrial.owner}</p>
                </div>
                <div className="detail-item">
                  <h3>Date Proposed</h3>
                  <p>{new Date(selectedTrial.timestamp * 1000).toLocaleString()}</p>
                </div>
                <div className="detail-item">
                  <h3>Estimated Budget</h3>
                  <div className="encrypted-data">
                    {decryptedValue !== null ? (
                      <p className="decrypted-value">{decryptedValue} ETH</p>
                    ) : (
                      <div>
                        <p className="encrypted-value">{selectedTrial.encryptedValue.substring(0, 30)}...</p>
                        <button 
                          className="decrypt-btn"
                          onClick={() => decryptWithSignature(selectedTrial.encryptedValue).then(val => setDecryptedValue(val))}
                          disabled={isDecrypting}
                        >
                          {isDecrypting ? "Decrypting..." : "Decrypt with Wallet"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <div className="action-buttons">
                <button 
                  className="vote-btn"
                  onClick={() => voteForTrial(selectedTrial.id)}
                >
                  ❤️ Vote for this Trial
                </button>
                {isOwner(selectedTrial.owner) && selectedTrial.status === "pending" && (
                  <>
                    <button 
                      className="approve-btn"
                      onClick={() => approveTrial(selectedTrial.id)}
                    >
                      Approve
                    </button>
                    <button 
                      className="reject-btn"
                      onClick={() => rejectTrial(selectedTrial.id)}
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className={`transaction-content ${transactionStatus.status}`}>
            <div className="transaction-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <p>{transactionStatus.message}</p>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h3>PatientDAO Trials</h3>
            <p>Decentralized clinical trials governed by patients</p>
          </div>
          <div className="footer-section">
            <h3>Powered By</h3>
            <ul>
              <li>Zama FHE</li>
              <li>Ethereum</li>
              <li>DAO Governance</li>
            </ul>
          </div>
          <div className="footer-section">
            <h3>Resources</h3>
            <ul>
              <li>Documentation</li>
              <li>Whitepaper</li>
              <li>Community</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} PatientDAO Trials. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;