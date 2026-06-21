const Joi = require('joi');

const workOrderSchema = Joi.object({
  assetId: Joi.number().integer().required(),
  categoryId: Joi.number().integer().required(),
  name: Joi.string().trim().min(3).max(255).required(),
  description: Joi.string().trim().max(5000).allow('', null),
  priority: Joi.string().valid('Низкий', 'Средний', 'Высокий', 'Критичный').default('Средний'),
  deadline: Joi.date().iso().allow(null)
});

const userSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(128).required(),
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  middleName: Joi.string().trim().max(100).allow('', null),
  phone: Joi.string().trim().max(20).allow('', null),
  departmentId: Joi.number().integer().allow(null)
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

module.exports = {
  workOrderSchema,
  userSchema,
  loginSchema
};