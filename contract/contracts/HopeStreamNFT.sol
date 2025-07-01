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

    event DonorNFTMinted(address indexed donor, uint256 indexed tokenId, uint256 donationAmount);

    constructor(address initialOwner)
        ERC721("HopeStream Donor NFT", "HSNFT")
        ERC721Votes()
        EIP712("HopeStreamNFT", "1")
        Ownable(initialOwner)
    {}

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
        
        emit DonorNFTMinted(to, tokenId, 0);
    }

    // Enhanced mint with donation tracking
    function mintWithDonation(address to, string memory uri, uint256 donationAmount) external onlyVault {
        uint256 tokenId = nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        
        tokenDonationAmount[tokenId] = donationAmount;
        totalDonationByAddress[to] += donationAmount;
        
        nextTokenId++;
        
        emit DonorNFTMinted(to, tokenId, donationAmount);
    }

    // Soulbound NFT: Block transfers unless minting or burning
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Votes) returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "Soulbound: non-transferable");
        return super._update(to, tokenId, auth);
    }

    // Override required functions
    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Votes) {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC721Votes)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // Override voting power to be donation-weighted instead of NFT count
    function _getVotingUnits(address account) internal view override returns (uint256) {
        // Return voting power based on total donation amount (scaled to 18 decimals)
        // This prevents Sybil attacks by making voting power proportional to contribution
        return totalDonationByAddress[account];
    }

    // DAO Utility Functions
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
    
    // Get voting power breakdown for transparency
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