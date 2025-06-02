// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract HopeStreamNFT is ERC721URIStorage, Ownable {
    uint256 public nextTokenId;
    address public donationVault;

    constructor(address initialOwner)
        ERC721("HopeStream Donor NFT", "HSNFT")
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
    }

    // Soulbound NFT: Block transfers unless minting or burning
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = super._ownerOf(tokenId);
        require(from == address(0) || to == address(0), "Soulbound: non-transferable");
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}