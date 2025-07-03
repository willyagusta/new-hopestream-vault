import snapshot from '@snapshot-labs/snapshot.js';

const hub = 'https://hub.snapshot.org';
const space = 'hopestream.eth';

const client = new snapshot.Client712(hub);

export const createSnapshotProposal = async ({
  address,
  signer,
  title,
  body,
  choices = ["Yes", "No"],
  durationSeconds = 86400, // 1 day
  network = '1', // Ethereum
  strategies = [
    {
      name: 'erc721',
      network: '1',
      params: {
        address: '0xYourNFTContractAddress' // REPLACE with actual
      }
    }
  ]
}) => {
  const snapshotBlock = await signer.provider.getBlockNumber();
  const start = Math.floor(Date.now() / 1000);
  const end = start + durationSeconds;

  const proposal = {
    space,
    type: 'single-choice',
    title,
    body,
    choices,
    start,
    end,
    snapshot: snapshotBlock,
    network,
    strategies,
    plugins: JSON.stringify({}),
    metadata: JSON.stringify({})
  };

  return client.proposal(signer, address, proposal);
};

export const voteOnSnapshotProposal = async ({
  address,
  signer,
  proposalId,
  choice = 1 // 1 = Yes, 2 = No
}) => {
  return client.vote(signer, address, {
    space,
    proposal: proposalId,
    type: 'single-choice',
    choice,
    metadata: JSON.stringify({})
  });
};

export const fetchSnapshotProposals = async () => {
  const res = await fetch(`https://hub.snapshot.org/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query {
          proposals(
            first: 10,
            where: { space: "${space}" },
            orderBy: "created",
            orderDirection: desc
          ) {
            id
            title
            body
            choices
            start
            end
            state
          }
        }
      `
    })
  });

  const json = await res.json();
  return json.data.proposals;
};