const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class User extends Model {}
  User.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    birth_date: DataTypes.DATEONLY,
    bio: DataTypes.TEXT,
    status_relacionamento: DataTypes.STRING,
    modo_discreto: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    foto_url: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'Users', // Nome igual ao da migration
    underscored: true,
    paranoid: true, // Soft delete
  });
  return User;
};