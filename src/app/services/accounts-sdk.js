import axios from 'axios'
import Cookies from 'js-cookie'
import invariant from 'invariant'
import jwtDecode from 'jwt-decode'

function getQueries() {
  const tokens = window.location.search.slice(1, window.location.search.length).split(`&`)
  return tokens.reduce((map, token) => {
    const kv = token.split('=')
    map[kv[0]] = decodeURIComponent(kv[1])
    return map
  }, {}) || {}
}

class AccountsSDK {
  configured = false
  // accounts backend host url eg. 'http://accounts.foo.com'
  host = undefined
  // domain authority of jwt eg. '.foo.com'
  domain = undefined
  // url of auth frontend eg. 'http://accountsfe.foo.com'
  authUrl = undefined

  _requireConfigured = () => {
    invariant(this.configured, `Call this.configure() first`)
  }

  configure = ({
    host,
    domain,
    authUrl,
  }) => {
    invariant(host && domain, `'host' 'domain' must be provided`)

    this.host = host
    this.domain = domain
    if (authUrl) this.authUrl = authUrl
    this.configured = true
  }

  getJwt = () => {
    return Cookies.get(`_jwt`)
  }

  setJwt = (jwt, opts) => {
    return Cookies.set(`_jwt`, jwt, Object.assign({}, {
      path: '',
      domain: this.domain,
    }, opts))
  }

  redirectTo = (url) => {
    window.location = url
  }

  onAuthenticated = ({
    token,
    tokenExp,
    redirect,
  }) => {
    // set jwt in domain cookie
    this.setJwt(token, { expires: tokenExp })

    // redirect to origin if specified
    if (redirect) {
      return this.redirectTo(redirect)
    }
    const urlQueries = getQueries()
    if (urlQueries.origin) {
      return this.redirectTo(urlQueries.origin)
    }
    // some default location in accountsfrontend maybe a homepage?
    this.redirectTo(`/`)
  }

  signup = async ({
    email,
    password,
    redirect,
  }) => {
    this._requireConfigured()
    invariant(email && password, `'email' and 'password' must be provided`)

    const res = await axios.post(`${this.host}/api/signup`, { email, password })

    this.onAuthenticated({
      token: res.data.token.token,
      tokenExp: res.data.token.tokenExp,
      redirect,
    })
  }

  authenticate = async ({
    email,
    password,
    // optional redirect url for routing to on successful authentication
    redirect,
  }) => {
    this._requireConfigured()
    invariant(email && password, `'email' and 'password' must be provided`)

    const res = await axios.post(`${this.host}/api/authenticate`, { email, password })

    this.onAuthenticated({
      token: res.data.token.token,
      tokenExp: res.data.token.tokenExp,
      redirect,
    })
  }

  logout = async () => {
    this._requireConfigured()

    await axios.post(`${this.host}/api/logout`, {
      token: this.getJwt(),
    })

    this.redirectTo('/')
  }

  verify = async (jwt) => {
    this._requireConfigured()
    invariant(jwt, `'jwt' must be provided`)

    await axios.post(`${this.host}/api/verify`, { token: jwt })
  }

  // use with react-router onEnter
  requireAuthentication = async () => {
    this._requireConfigured()
    const jwt = this.getJwt()
    if (!jwt) {
      this.redirectTo(`${this.authUrl}/signin?origin=${window.location.href}`)
    }
    try {
      await this.verify(jwt)
    } catch (e) {
      this.redirectTo(`${this.authUrl}/signin?origin=${window.location.href}`)
    }
  }

  getUser = async () => {
    this._requireConfigured()
    const jwt = this.getJwt()
    const decoded = jwtDecode(jwt)

    const res = await axios.get(`${this.host}/api/getUser?id=${decoded.id}`, {
      headers: {
        'session-token': jwt,
      },
    })

    return res.data.user
  }
}

export default new AccountsSDK()
