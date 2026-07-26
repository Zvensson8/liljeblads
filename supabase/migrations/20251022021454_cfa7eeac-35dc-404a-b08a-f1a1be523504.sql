-- Update andreas@liljeblads.com to have founder role
UPDATE user_roles 
SET role = 'founder'
WHERE user_id = (SELECT id FROM profiles WHERE email = 'andreas@liljeblads.com');