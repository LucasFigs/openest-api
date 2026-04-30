module.exports = (req, res, next) => {
  // O req.user é preenchido pelo seu middleware de auth anterior
  if (req.user && req.user.is_admin) {
    next();
  } else {
    res.status(403).json({ 
      error: "Acesso negado. Recurso restrito a administradores." 
    });
  }
};