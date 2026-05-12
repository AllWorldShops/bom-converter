import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token =
    req.cookies?.accessToken ||
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined)

  if (!token) return res.status(401).json({ error: 'Authentication required' })

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
