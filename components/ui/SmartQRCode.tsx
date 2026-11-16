import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { COLORS } from '@/constants/colors';

type SmartQRCodeProps = {
  value: string;
  size?: number;
};

export default function SmartQRCode({
  value,
  size = 200,
}: SmartQRCodeProps) {
  const logoSize = Math.round(size * 0.26);
  const radius = Math.round(logoSize * 0.3);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <QRCode
        value={value}
        size={size}
        ecl="H"
        quietZone={Math.round(size * 0.07)}
        color={COLORS.qrDark}
        backgroundColor="#FFFFFF"
        enableLinearGradient
        gradientDirection={['0%', '0%', '100%', '100%']}
        linearGradient={['#04101D', '#0B6078']}
      />
      <View style={styles.logoLayer} pointerEvents="none">
        <View
          style={[
            styles.logoBadge,
            {
              width: logoSize,
              height: logoSize,
              borderRadius: radius,
            },
          ]}
        >
          <Text
            style={[
              styles.logoText,
              { fontSize: Math.round(logoSize * 0.42) },
            ]}
          >
            JA
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
  },
  logoLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#22D3EE66',
    shadowColor: '#22D3EE',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  logoText: {
    color: COLORS.qrDark,
    fontWeight: '900',
    letterSpacing: 0.5,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
