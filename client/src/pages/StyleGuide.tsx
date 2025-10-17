import React from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLogo } from '@/components/BrandLogo';

const StyleGuidePage: React.FC = () => {
  return (
    <Layout>
      <div className="container max-w-container py-12">
        <h1 className="text-display mb-8">Style Guide</h1>

        <section className="mb-12">
          <h2 className="text-heading mb-4">Typography</h2>
          <div className="space-y-4">
            <p className="text-display">Display: The quick brown fox jumps over the lazy dog.</p>
            <p className="text-heading">Heading: The quick brown fox jumps over the lazy dog.</p>
            <p className="text-body">Body: The quick brown fox jumps over the lazy dog.</p>
            <p className="text-small">Small: The quick brown fox jumps over the lazy dog.</p>
            <p className="text-code">Code: The quick brown fox jumps over the lazy dog.</p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-heading mb-4">Buttons</h2>
          <div className="flex flex-wrap gap-4">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-heading mb-4">Cards</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Card Title</CardTitle>
              </CardHeader>
              <CardContent>
                <p>This is the content of the card. It can be used to display information.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Another Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p>This is another card with some different content.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section>
          <h2 className="text-heading mb-4">Brand Logos</h2>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-body mb-2">Logotype</p>
              <BrandLogo variant="wordmark" size={120} />
            </div>
            <div>
              <p className="text-body mb-2">Logomark</p>
              <BrandLogo variant="mark" size={32} />
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default StyleGuidePage;