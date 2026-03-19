module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const products = [
        { id: 'PROD_1', name: 'Sofá Retrátil Florença', description: 'Design moderno.', price: 3200.00, image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80' },
        { id: 'PROD_2', name: 'Mesa de Jantar Imperial', description: 'Madeira maciça.', price: 4500.00, image: 'https://images.unsplash.com/photo-1615874959474-d609969a20ed?auto=format&fit=crop&w=400&q=80' },
        { id: 'PROD_3', name: 'Poltrona Decorativa Lótus', description: 'Design orgânico.', price: 1150.00, image: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&w=400&q=80' }
    ];
    res.status(200).json(products);
};
