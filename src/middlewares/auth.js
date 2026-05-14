const jwt = require('jsonwebtoken');
const { User } = require('../models'); // Ajuste o caminho se a sua pasta de models for diferente

module.exports = (req, res, next) => {
    // 1. Extrair o token do header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    // O header vem no formato "Bearer TOKEN_AQUI", vamos separar
    const parts = authHeader.split(' ');

    if (parts.length !== 2) {
        return res.status(401).json({ error: 'Erro no formato do token' });
    }

    const [scheme, token] = parts;

    if (!/^Bearer$/i.test(scheme)) {
        return res.status(401).json({ error: 'Token malformado' });
    }

    // 2. Validar o token com o JWT_SECRET
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }

        try {
            // 3. Busca o utilizador atualizado no banco de dados
            const user = await User.findByPk(decoded.id);

            if (!user) {
                return res.status(401).json({ error: 'Usuário não encontrado' });
            }

            // 4. Anexa TODO o utilizador (incluindo o is_admin = true) no req
            req.user = user;

            return next();
        } catch (dbError) {
            console.error("Erro ao buscar usuário no auth.js:", dbError);
            return res.status(500).json({ error: 'Erro interno na validação' });
        }
    });
};