import React, { useEffect, useState } from 'react';

const App: React.FC = () => {
  const [config, setConfig] = useState({
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsRegion: 'eu-west-3',
    s3Bucket: 'occupational-health-medical-conversation-recordings'
  });
  const [status, setStatus] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({
    show: false,
    type: 'success',
    message: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load existing config
    chrome.storage.sync.get([
      'awsAccessKeyId',
      'awsSecretAccessKey',
      'awsRegion',
      's3Bucket'
    ], (result) => {
      if (result.awsAccessKeyId) {
        setConfig({
          awsAccessKeyId: result.awsAccessKeyId || '',
          awsSecretAccessKey: result.awsSecretAccessKey || '',
          awsRegion: result.awsRegion || 'eu-west-3',
          s3Bucket: result.s3Bucket || 'occupational-health-medical-conversation-recordings'
        });
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await chrome.storage.sync.set(config);
      setStatus({
        show: true,
        type: 'success',
        message: 'Settings saved successfully!'
      });
    } catch (error) {
      setStatus({
        show: true,
        type: 'error',
        message: `Failed to save settings: ${(error as Error).message}`
      });
    } finally {
      setLoading(false);
      // Hide status after 3 seconds
      setTimeout(() => {
        setStatus({ show: false, type: 'success', message: '' });
      }, 3000);
    }
  };

  const handleChange = (field: string, value: string) => {
    setConfig({ ...config, [field]: value });
  };

  return (
    <div className="container">
      <h1>AWS S3 Configuration</h1>
      <p>Configure your AWS credentials for uploading recordings to S3.</p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="awsAccessKeyId">AWS Access Key ID</label>
          <input
            type="text"
            id="awsAccessKeyId"
            value={config.awsAccessKeyId}
            onChange={(e) => handleChange('awsAccessKeyId', e.target.value)}
            required
          />
          <div className="help-text">Your AWS access key ID from IAM</div>
        </div>

        <div className="form-group">
          <label htmlFor="awsSecretAccessKey">AWS Secret Access Key</label>
          <input
            type="password"
            id="awsSecretAccessKey"
            value={config.awsSecretAccessKey}
            onChange={(e) => handleChange('awsSecretAccessKey', e.target.value)}
            required
          />
          <div className="help-text">Your AWS secret access key (will be stored securely)</div>
        </div>

        <div className="form-group">
          <label htmlFor="awsRegion">AWS Region</label>
          <input
            type="text"
            id="awsRegion"
            value={config.awsRegion}
            onChange={(e) => handleChange('awsRegion', e.target.value)}
            placeholder="e.g., eu-west-3, us-east-1"
            required
          />
          <div className="help-text">The AWS region where your S3 bucket is located</div>
        </div>

        <div className="form-group">
          <label htmlFor="s3Bucket">S3 Bucket Name</label>
          <input
            type="text"
            id="s3Bucket"
            value={config.s3Bucket}
            onChange={(e) => handleChange('s3Bucket', e.target.value)}
            required
          />
          <div className="help-text">The name of your S3 bucket for storing recordings</div>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>

        {status.show && (
          <div className={`status ${status.type} show`}>
            {status.message}
          </div>
        )}
      </form>
    </div>
  );
};

export default App;
