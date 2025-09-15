// Enhanced authentication middleware with debug logging
const authenticateTokenDebug = (req, res, next) => {
  console.log(' Auth Debug - Headers:', {
    authorization: req.headers.authorization,
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent']?.substring(0, 50)
  });
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  console.log('🔍 Auth Debug - Token:', {
    hasAuthHeader: !!authHeader,
    tokenLength: token?.length || 0,
    tokenPreview: token?.substring(0, 20) + '...' || 'none'
  });
  
  if (!token) {
    console.warn('❌ Auth Debug - No token provided');
    return res.status(401).json({ 
      success: false, 
      message: 'Access token required',
      debug: 'No Authorization header or token found'
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    console.log(' Auth Debug - Token valid for user:', {
      userId: decoded.userId,
      email: decoded.email,
      exp: new Date(decoded.exp * 1000)
    });
    req.user = decoded;
    next();
  } catch (err) {
    console.error(' Auth Debug - Token verification failed:', {
      error: err.message,
      tokenPreview: token.substring(0, 20) + '...',
      jwtSecret: process.env.JWT_SECRET ? 'configured' : 'missing'
    });
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid or expired token',
      debug: err.message
    });
  }
};
