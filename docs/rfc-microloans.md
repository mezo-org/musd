
# Draft RFC: Microloans Protocol

## 1. Purpose and Motivation

Users are currently unable to borrow less than $1800 via MUSD due to protocol-level and economic constraints, excluding those who require smaller, more flexible borrowing options. This RFC proposes a minimally-invasive extension of the existing BTC-backed MUSD protocol to enable **microloans**—small, collateralized loans with improved UX and accessibility—while leveraging as much of the current codebase as possible to hit an August 1st testnet target.

---

## 2. Background

- **Current Protocol:**  
  MUSD requires users to over-collateralize loans with BTC to mint MUSD. It enforces a collateralization ratio, liquidation threshold, liquidation incentive, and a minimum loan size of $1800.

- **Pain Points:**
    - Minimum size excludes many users.
    - Liquidation and gas incentive parameters not optimized for smaller loans.
    - User experience is more complex than is desirable for small borrowers.

---

## 3. Goals & Non-Goals

### Goals
- Lower the minimum loan size well below $1800 (target: as low as $25–$50 if feasible).
- Simplify the borrowing experience for microloan users.
- Modify as little of the core MUSD code as necessary (parameter changes preferred over new logic).
- Deploy a testnet version by August 1st.

### Non-Goals
- Implementing new collateral types.
- Major logic overhauls or upgrades to the core protocol.
- Production mainnet launch before further iteration and safety review.

---

## 4. Evaluation of Approaches

**A. Full Rewrite / New Approach**
- Designing and implementing a novel mechanism for providing microloans.
- Out of scope due to time/resource constraints.

**B. Parameterized Fork of MUSD (Preferred)**
- Lower min loan amount, reduce liquidation compensation/gas incentive, adjust user fees.
- Maintain 1:1 parity with existing MUSD wherever possible.
- Use the same frontend as MUSD with minor edits.

---

## 5. Technical Proposal

### Protocol Parameter Changes (Proposed/Testnet Only)
- **Minimum Loan Size**: Lowered (target: $25–$50 in MUSD)
- **Liquidation Gas Compensation / Incentive**: Reduce to the smallest viable unit, based on empirical testing (open item—exact value pending)
- **Borrower Fees**: Review and modify to account for smaller loan size.
- **Liquidation Incentives**: Analyze minimum viable; may require testnet/POC validation.

### Implementation/Testing Plan

1. **Deploy modified MUSD contracts to testnet, lower relevant parameters.**
2. **Manual and script-based validation:**
    - Open, close, and liquidate microloans at target sizes using scale testing scripts.
    - Record gas costs, incentive amounts, and any functional issues.
3. **Monitor failed/edge-case behavior:**
    - Look for rounding issues, economic “breaks”, out-of-gas errors, etc.
4. **Summarize findings for iteration** before any production move.

---

## 6. Risks and Mitigations

| Risk                           | Mitigation                                               |
|--------------------------------|----------------------------------------------------------|
| Gas cost outpaces loan principal| Validate, set a minimum loan size based on gas costs     |
| Liquidations are unprofitable  | Liquidation incentive parameter must be tested/validated |
| Increased griefing/spam        | Monitor: consider rate-limits or per-user restrictions   |

---

## 7. Open Questions

- **What is the absolute floor for loan size vs. transaction cost?**
- **At what incentive are users still willing to liquidate?**
- **Any new security considerations unique to small principal loans?**

---

## 8. Action Items

- Configure contracts and deploy parameterized version on testnet/local
- Run E2E manual and scripted microloan interactions; collect and analyze data, especially on gas cost and incentive economics
- Update RFC (and tests) with findings; finalize parameter set
- Demo working testnet microloans to stakeholders; collect feedback; plan for further mainnet iteration

---

## 9. Temporary Notes

> **Unit Tests Pending**: Many unit tests currently fail due to hardcoded params or outdated assumptions. These will be reviewed and updated after completing initial feasibility validation.

---
