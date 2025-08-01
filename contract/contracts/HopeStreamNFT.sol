// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract HopeStreamNFT is ERC721URIStorage, ERC721Votes, Ownable {
    uint256 public nextTokenId;
    address public donationVault;
    
    // Track donation amounts for weighted voting
    mapping(uint256 => uint256) public tokenDonationAmount;
    mapping(address => uint256) public totalDonationByAddress;
    
    // Track total donations across all users for quorum calculation
    uint256 private _totalDonationSupply;

    event DonorNFTMinted(address indexed donor, uint256 indexed tokenId, uint256 donationAmount);

    constructor(address initialOwner)
        ERC721("HopeStream Donor NFT", "HSNFT")
        ERC721Votes()
        EIP712("HopeStreamNFT", "1")
        Ownable(initialOwner)
    {
        // Constructor body is empty as Ownable(initialOwner) handles ownership transfer
    }

    modifier onlyVault() {
        require(msg.sender == donationVault, "Only vault can mint");
        _;
    }

    function setDonationVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault address");
        donationVault = _vault;
    }

    function mint(address to, string memory uri) external onlyVault {
        uint256 tokenId = nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        nextTokenId++;
        
        // Auto-delegate voting power to the recipient
        if (delegates(to) == address(0)) {
            _delegate(to, to);
        }
        
        emit DonorNFTMinted(to, tokenId, 0);
    }

    // Enhanced mint with donation tracking
    function mintWithDonation(address to, string memory uri, uint256 donationAmount) external onlyVault {
        uint256 tokenId = nextTokenId;
        
        // Update donation tracking BEFORE minting so voting power is calculated correctly
        tokenDonationAmount[tokenId] = donationAmount;
        totalDonationByAddress[to] += donationAmount;
        _totalDonationSupply += donationAmount;
        
        // Auto-delegate voting power to the recipient if not already delegated
        if (delegates(to) == address(0)) {
            _delegate(to, to);
        }
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        nextTokenId++;
        
        emit DonorNFTMinted(to, tokenId, donationAmount);
    }

    // Required overrides for multiple inheritance in v5.x
    function _update(address to, uint256 tokenId, address auth) 
        internal 
        override(ERC721, ERC721Votes) 
        returns (address) 
    {
        address from = _ownerOf(tokenId);
        
        // Soulbound NFT: Block transfers except minting and burning
        if (from != address(0) && to != address(0)) {
            revert("Soulbound: non-transferable");
        }
        
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) 
        internal 
        override(ERC721, ERC721Votes) 
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId) 
        public 
        view 
        override(ERC721, ERC721URIStorage) 
        returns (string memory) 
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // Override voting power to be donation-weighted instead of NFT count
    function _getVotingUnits(address account) internal view override returns (uint256) {
        return totalDonationByAddress[account];
    }

    function getVotes(address account) public view override returns (uint256) {
        return totalDonationByAddress[account];
    }

    function getPastTotalSupply(uint256 blockNumber) public view override returns (uint256) {
        return _totalDonationSupply;
    }

    // Utility functions
    function getTotalDonationSupply() external view returns (uint256) {
        return _totalDonationSupply;
    }

    function getVotingPower(address account) external view returns (uint256) {
        return getVotes(account);
    }
    
    function getVotingPowerByDonation(address account) external view returns (uint256) {
        return totalDonationByAddress[account];
    }

    function getTotalDonationAmount(address account) external view returns (uint256) {
        return totalDonationByAddress[account];
    }

    function getTokenDonationAmount(uint256 tokenId) external view returns (uint256) {
        return tokenDonationAmount[tokenId];
    }
    
    function getVotingBreakdown(address account) external view returns (
        uint256 nftCount,
        uint256 totalDonation,
        uint256 votingPower,
        uint256 averageDonationPerNFT
    ) {
        uint256 nftCount_ = balanceOf(account);
        uint256 totalDonation_ = totalDonationByAddress[account];
        uint256 votingPower_ = getVotes(account);
        uint256 avgDonation = nftCount_ > 0 ? totalDonation_ / nftCount_ : 0;
        
        return (nftCount_, totalDonation_, votingPower_, avgDonation);
    }
}