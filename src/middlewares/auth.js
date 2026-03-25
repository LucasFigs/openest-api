const jwt = require('jsonwebtoken');

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
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }

        // 3. Se válido, anexa os dados no req para as próximas funções usarem
       req.user = {
         id: decoded.id,
         email: decoded.email
};

return next();
    });
};