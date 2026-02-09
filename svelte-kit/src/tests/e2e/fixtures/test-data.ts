export const MARIA_DIABETES_MESSAGES = [
	{
		role: 'user',
		content:
			'Hi, I am Maria, 68 years old with type 2 diabetes and vision problems. I take insulin and blood pressure medication every morning and evening.'
	},
	{
		role: 'user',
		content:
			'For the last few weeks I sometimes feel dizzy about two hours after my morning medication. Please help me keep track of these symptoms and medications.'
	}
] as const;

export const MARIA_REMINDER_REQUEST =
	'Remind me to take my insulin and blood pressure medication every morning at 8 AM.';
