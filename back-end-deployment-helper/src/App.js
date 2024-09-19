import React, { useRef, useState } from 'react';
import { Button, Select, Input, Alert, Spin, message } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

import './App.css';
import { generateCode } from './util';

const defaultConfig = {
  replayURL: 'http://localhost/onedrive-login',
  publicParams:
    '&scope=offline_access%20User.Read%20Files.ReadWrite.All&response_type=code',
  version: {
    cn: {
      api: 'https://login.partner.microsoftonline.cn',
      restApi: 'https://microsoftgraph.chinacloudapi.cn',
      clientID: 'dfe36e60-6133-48cf-869f-4d15b8354769',
      clientSecret: 'H0-1:6.Sb8:WCW/J-c]K@fddCt[i0EZ2',
    },
    other: {
      api: 'https://login.microsoftonline.com',
      restApi: 'https://graph.microsoft.com',
      clientID: '78d4dc35-7e46-42c6-9023-2d39314433a5',
      clientSecret: 'ZudGl-p.m=LMmr3VrKgAyOf-WevB3p50',
    },
  },
  reverseProxyURL: 'https://www.reverseproxy.com',
};

function App() {
  const { Option } = Select;
  const antIcon = <LoadingOutlined spin />;

  const [version, setVersion] = useState();
  const [replayURL, setReplayURL] = useState();
  const [clientID, setClientID] = useState();
  const [clientSecret, setClientSecret] = useState();
  const [redirectURL, setRedirectURL] = useState();
  const [passwordFilename, setPasswordFilename] = useState();
  const [exposedPath, setExposedPath] = useState();
  const [protectedLayers, setProtected] = useState();
  const [exposePw, setExposePw] = useState();
  const [code, setCode] = useState();
  const [error, setError] = useState();
  const [loading, setLoading] = useState();
  const textAreaRef = useRef();

  const changeVersion = (v) => {
    if (v === 'select') {
      setVersion(null);
      setReplayURL(null);
      setClientID(null);
      setClientSecret(null);
      return;
    }
    setRedirectURL(null);
    setVersion(v);
    const config = defaultConfig.version[v];
    setReplayURL(defaultConfig.replayURL);
    setClientID(config.clientID);
    setClientSecret(config.clientSecret);
  };

  const login = () => {
    if (!version || version === 'select') return;
    const config = defaultConfig.version[version];
    window.open(
      `${config.api}/common/oauth2/v2.0/authorize?client_id=` +
        `${clientID}${defaultConfig.publicParams}&redirect_uri=${replayURL}`
    );
  };

  const getCode = () => {
    if (!version || !redirectURL || version === 'select') return;
    let code;
    try {
      code = new URLSearchParams(new URL(redirectURL).search).get('code');
    } catch (e) {
      setError('跳转地址错误');
      return;
    }
    setError(null);
    setLoading(true);

    const headers = new Headers();
    headers.append('Content-Type', 'application/x-www-form-urlencoded');

    const urlencoded = new URLSearchParams();
    urlencoded.append('client_id', clientID);
    urlencoded.append('redirect_uri', replayURL);
    urlencoded.append('client_secret', clientSecret);
    urlencoded.append('code', code);
    urlencoded.append('grant_type', 'authorization_code');

    const requestOptions = {
      method: 'POST',
      headers: headers,
      body: urlencoded,
      redirect: 'follow',
    };

    fetch(
      `${defaultConfig.reverseProxyURL}?url=${defaultConfig.version[version].api}/common/oauth2/v2.0/token`,
      requestOptions
    )
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setLoading(null);
        if ('error' in data) {
          setError(data.error_description);
        } else {
          generateCode(
            defaultConfig.reverseProxyURL,
            defaultConfig.version[version].api,
            defaultConfig.version[version].restApi,
            clientID,
            clientSecret,
            replayURL,
            data.refresh_token,
            exposedPath || '',
            passwordFilename || '.password',
            protectedLayers || '-1',
            exposePw || ''
          )
            .then((code) => setCode(code))
            .catch((err) => setError(err.message));
        }
      })
      .catch((error) => {
        setLoading(null);
        setError(error);
      });
  };

  const copyCode = (e) => {
    if (!code) return;
    textAreaRef.current.select();
    document.execCommand('copy');
    e.target.focus();
    message.success('复制成功');
  };

  return (
    <div className={`main ${error && 'with-error'}`}>
      {loading && <Spin className="progress" indicator={antIcon} />}
      {error && (
        <Alert
          className="alert"
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          onClose={(_) => setError(null)}
        />
      )}

      <div>
        <div className="header">FODI DEPLOYMENT HELPER</div>

        <div className="content">
          <div className="steps">
            <ul>
              <li>选择版本，点击按钮完成登录，登录成功会跳转到 localhost</li>
              <li>此时复制地址栏链接粘贴到下方 “浏览器跳转地址” 输入框</li>
              <li>点击获取代码，代码出现后，点击复制代码</li>
              <li>打开 Cloudflare Worker 编辑器，覆盖粘贴原有代码保存</li>
            </ul>
          </div>

          <div className="input version">
            <Select
              size="large"
              defaultValue="select"
              onChange={(v) => changeVersion(v)}
            >
              <Option value="select">请选择版本</Option>
              <Option value="cn">世纪互联</Option>
              <Option value="other">其他版本</Option>
            </Select>
            <Input
              placeholder="CLIENT_ID"
              value={clientID}
              onChange={(e) => setClientID(e.target.value)}
            />
            <Input
              placeholder="CLIENT_SECRET"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>

          <div className="input between">
            <Input
              placeholder="ReplayURL（自定义 ID、SECRET 时，需要填写）"
              value={replayURL}
              onChange={(e) => setReplayURL(e.target.value)}
            />
            <Button onClick={login}>前往登录</Button>
          </div>

          <div className="input">
            <Input
              placeholder="浏览器跳转地址"
              value={redirectURL}
              onChange={(e) => setRedirectURL(e.target.value)}
            />
          </div>

          <div className="input between">
            <Input
              placeholder="展示文件夹（默认根路径）"
              value={exposedPath}
              onChange={(e) => setExposedPath(e.target.value)}
            />
            <Input
              placeholder="密码文件名（默认 .password）"
              value={passwordFilename}
              onChange={(e) => setPasswordFilename(e.target.value)}
            />
          </div>

          <div className="input between">
            <Input
              placeholder="保护目录（默认 -1 不开启，保护 /Applications 为 2）"
              value={protectedLayers}
              onChange={(e) => setProtected(e.target.value)}
            />
            <Input
              placeholder="保护目录密码，优先级高于密码文件中的密码"
              value={exposePw}
              onChange={(e) => setExposePw(e.target.value)}
            />
          </div>

          <div className="input between">
            <Button onClick={getCode}>获取代码</Button>
            <Button onClick={copyCode}>复制代码</Button>
          </div>
        </div>
      </div>

      <div className="code">
        <textarea
          value={code}
          ref={textAreaRef}
          onChange={(e) => setCode(e.target.value)}
        ></textarea>
      </div>
      <div className="footer">FODI © {new Date().getFullYear()} </div>
    </div>
  );
}

export default App;
