# Patient DAO: A Decentralized Clinical Trial Platform

Patient DAO is a groundbreaking clinical trial platform empowered by **Zama's Fully Homomorphic Encryption (FHE) technology**. This innovative project aims to create a decentralized environment where patient communities can govern research studies while safeguarding the privacy of their health data. The platform ensures that patients have the ultimate control over their participation in clinical trials through a patient-driven Decentralized Autonomous Organization (DAO).

## Addressing the Challenge

The current clinical trial landscape is fraught with issues, including lack of transparency, limited patient involvement, and concerns over data privacy. Often, large pharmaceutical companies dictate the direction of research, sidelining patient voices and making decisions that may not align with their best interests. Furthermore, sensitive health data is frequently exposed, leading to privacy breaches and loss of trust in the system.

## The FHE Solution

Zama’s Fully Homomorphic Encryption technology provides an elegant solution to these challenges. By utilizing FHE, Patient DAO enables researchers to analyze encrypted health data without exposing it. This ensures that patients can vote on proposed studies safely and privately, while their health data remains secure. Implemented with Zama's open-source libraries, such as **Concrete** and **TFHE-rs**, the platform combines robust encryption methods with a decentralized governance model to empower patient communities and enhance ethical standards in clinical research.

## Core Features

- **Patient Governance:** A DAO governed by patients ensures they have the final say in research decisions.
- **Encrypted Clinical Data:** All clinical trial data is securely encrypted using FHE, maintaining participant confidentiality.
- **Empowerment of Patients:** The platform seeks to shift power from large pharmaceutical companies to patients, fostering more ethical research practices.
- **Research Proposal Portal:** A user-friendly interface for patients to review and vote on research proposals.

## Technology Stack

- **Zama FHE SDK** (Concrete, TFHE-rs)
- **Smart Contracts** (Solidity)
- **Node.js** (for backend services)
- **Hardhat** (development environment)
- **IPFS** (for decentralized file storage)
- **Ethereum Blockchain** (for implementing the DAO functionality)

## Directory Structure

Here's a quick overview of the project's file structure:

```
Patient_DAO_DeSci/
├── contracts/
│   └── Patient_DAO.sol
├── scripts/
│   └── deploy.js
├── tests/
│   └── Patient_DAO.test.js
├── src/
│   └── index.js
├── package.json
└── README.md
```

## Installation Guide

To set up Patient DAO on your local machine, follow these instructions:

1. **Prerequisites:**
   - Ensure you have [Node.js](https://nodejs.org) installed (version 14 or higher recommended).
   - Install Hardhat by running `npm install --save-dev hardhat`.

2. **Download the project:**
   - Ensure you download the project files. **(No `git clone` or URLs are allowed)**.

3. **Install dependencies:**
   - Navigate to the project directory and run the following command to install the required libraries, including Zama’s FHE libraries:

   ```bash
   npm install
   ```

## Build & Run Guide

To compile, test, and run the Patient DAO project, use the following commands:

1. **Compile the smart contracts:**
   ```bash
   npx hardhat compile
   ```

2. **Run tests to ensure everything is functioning correctly:**
   ```bash
   npx hardhat test
   ```

3. **Deploy the smart contracts to the local Hardhat network:**
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```

### Example Code Snippet

Here’s a brief code snippet demonstrating how to initialize a voting proposal within the Patient DAO contract:

```solidity
pragma solidity ^0.8.0;

import "./Patient_DAO.sol";

contract Proposal {
    Patient_DAO public dao;

    constructor(address _daoAddress) {
        dao = Patient_DAO(_daoAddress);
    }

    function createProposal(string memory description) public {
        require(dao.isPatient(msg.sender), "Only patients can create a proposal.");
        dao.submitProposal(description);
    }
}
```

This illustrates how a patient can create a proposal to be voted on within the DAO, ensuring their voice is heard in the clinical trial process.

## Acknowledgements

**Powered by Zama**  
A heartfelt thank you to the Zama team for their pioneering work in fully homomorphic encryption and for providing invaluable open-source tools. Their contributions are vital in creating a new era of confidential and secure blockchain applications that prioritize patient empowerment and ethical research practices. 

Through this platform, we aim to lead the way towards a more inclusive and transparent future in clinical research, where patients hold the reins and data privacy is non-negotiable. Join us in transforming the clinical trial landscape!