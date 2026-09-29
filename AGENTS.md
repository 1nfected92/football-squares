# Football Squares invariants

- This project is currently a demo/test-funds implementation. Do not enable real-money operation without legal and operational review.
- Rows are HOME, columns AWAY. Digits reveal only after all 100 squares sell.
- A board may sell in Q1, but not after Q1 ends. An unfilled board must cancel and refund.
- Every wallet mutation is an immutable ledger entry using integer cents.
- Commission is per checkpoint. Q1/Q2/Q3 gross use floor(pot/5); Final gets the remaining gross cents. Fee on each slice is floor(gross × basis points / 10000). Net plus commission across four checkpoints equals the pot.
- Every square is unique by board/row/column; every checkpoint settlement is unique by board/checkpoint.
- Only admins draw digits or settle checkpoints. Agent deposits require admin approval; withdrawals reserve at request and may be paid/rejected by agent or admin.
- Never expose privileged database keys in browser code. Every exposed table needs RLS and explicit grants.
- Migration has not been validated against a live isolated project. Do not mark financially sensitive features as verified without actual PostgreSQL concurrency, authorization, and end-to-end tests.
