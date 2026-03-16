const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';

  return {
    target: 'web',
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist-webpack'),
      filename: 'bundle.js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                '@babel/preset-typescript',
                'babel-preset-solid',
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        'process/browser': require.resolve('process/browser.js'),
        '@shared': path.resolve(__dirname, 'shared'),
        '@': path.resolve(__dirname, 'src'),
      },
      fallback: {
        path: require.resolve('path-browserify'),
        fs: false,
        process: require.resolve('process/browser.js'),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
        filename: 'index.html',
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser',
      }),
    ],
    devtool: isDevelopment ? 'source-map' : false,
  };
};
