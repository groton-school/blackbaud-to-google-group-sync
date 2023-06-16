import emailValidator from 'email-validator';

const nonEmpty = (value) => (value && value.length > 0) || 'May not be empty';

const maxLength = (maxLength, value) =>
  (nonEmpty(value) && value && value.length <= maxLength) ||
  `Must be ${maxLength} characters or fewer`;

const email = (value) =>
  (nonEmpty(value) && emailValidator.validate(value)) ||
  'Must be a valid mail address';

export default { nonEmpty, maxLength, email };
